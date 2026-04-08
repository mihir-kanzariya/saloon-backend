import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { Salon, LinkedAccount } from '../models';
import RazorpayService from '../services/razorpay.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class OnboardingController {
  // Map common state misspellings to Razorpay-accepted names
  private static readonly STATE_MAP: Record<string, string> = {
    'gujrat': 'Gujarat', 'gujrath': 'Gujarat', 'gujarat': 'Gujarat',
    'maharashtra': 'Maharashtra', 'maharastra': 'Maharashtra',
    'rajasthan': 'Rajasthan', 'rajshthan': 'Rajasthan',
    'karnataka': 'Karnataka', 'karnatak': 'Karnataka',
    'tamilnadu': 'Tamil Nadu', 'tamil nadu': 'Tamil Nadu',
    'delhi': 'Delhi', 'new delhi': 'Delhi',
    'up': 'Uttar Pradesh', 'uttar pradesh': 'Uttar Pradesh',
    'mp': 'Madhya Pradesh', 'madhya pradesh': 'Madhya Pradesh',
    'wb': 'West Bengal', 'west bengal': 'West Bengal',
    'ap': 'Andhra Pradesh', 'andhra pradesh': 'Andhra Pradesh',
    'telangana': 'Telangana', 'telengana': 'Telangana',
    'kerala': 'Kerala', 'punjab': 'Punjab', 'haryana': 'Haryana',
    'bihar': 'Bihar', 'odisha': 'Odisha', 'orissa': 'Odisha',
    'goa': 'Goa', 'assam': 'Assam', 'jharkhand': 'Jharkhand',
    'uttarakhand': 'Uttarakhand', 'chhattisgarh': 'Chhattisgarh',
  };

  static normalizeState(state: string): string {
    const key = state.trim().toLowerCase();
    return OnboardingController.STATE_MAP[key] || state.trim();
  }

  /**
   * POST /salons/:salonId/onboarding/linked-account
   * Create Razorpay linked account for salon (3-step flow).
   */
  static async createLinkedAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const {
        legal_business_name, business_type, contact_name, contact_email,
        contact_phone, pan, gst, bank_account_number, bank_ifsc,
        bank_beneficiary_name,
      } = req.body;

      // Check if salon already has a linked account
      const existing = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (existing) {
        throw ApiError.conflict('Salon already has a linked account');
      }

      const salon = await Salon.findByPk(salonId);
      if (!salon) {
        throw ApiError.notFound('Salon not found');
      }

      const rzp = RazorpayService.getInstance();
      const clientIp = req.ip || '127.0.0.1';

      // Step 1: Create linked account on Razorpay
      // For individual business type, PAN goes in legal_info only for non-individual types
      const legalInfo: Record<string, any> = {};
      if (business_type && business_type !== 'individual' && pan) {
        legalInfo.pan = pan;
      }
      if (gst) legalInfo.gst = gst;

      let account: any;
      try {
        account = await rzp.createLinkedAccount({
        email: contact_email,
        phone: contact_phone,
        legal_business_name,
        business_type: business_type || 'individual',
        contact_name,
        ...(Object.keys(legalInfo).length > 0 && { legal_info: legalInfo }),
        profile: {
          category: 'healthcare',
          subcategory: 'clinic',
          addresses: {
            operation: {
              street1: salon.address || '123 Main Road',
              street2: salon.city || 'Ahmedabad',
              city: salon.city || 'Ahmedabad',
              state: OnboardingController.normalizeState(salon.state || 'Gujarat'),
              postal_code: parseInt(salon.pincode || '380001'),
              country: 'IN',
            },
            registered: {
              street1: salon.address || '123 Main Road',
              street2: salon.city || 'Ahmedabad',
              city: salon.city || 'Ahmedabad',
              state: OnboardingController.normalizeState(salon.state || 'Gujarat'),
              postal_code: parseInt(salon.pincode || '380001'),
              country: 'IN',
            },
          },
        },
      });
      } catch (rzpError: any) {
        const errMsg = rzpError?.error?.description || rzpError?.message || 'Unknown Razorpay error';
        const errCode = rzpError?.error?.code || 'UNKNOWN';
        console.error('[Onboarding] Razorpay createLinkedAccount failed:', JSON.stringify(rzpError?.error || rzpError, null, 2));
        throw ApiError.badRequest(`Razorpay: ${errMsg} (${errCode})`);
      }

      // Step 2: Request product configuration (enable Route)
      let productConfig: any = null;
      try {
        productConfig = await rzp.requestProductConfig(account.id, {
          product_name: 'route',
          tnc_accepted: true,
          ip: clientIp,
        });
      } catch (err) {
        console.warn('[Onboarding] Product config request failed, will retry later:', err);
      }

      // Step 3: Set bank account for settlements
      if (productConfig?.id) {
        try {
          await rzp.updateProductConfig(account.id, productConfig.id, {
            settlements: {
              account_number: bank_account_number,
              ifsc_code: bank_ifsc,
              beneficiary_name: bank_beneficiary_name,
            },
            tnc_accepted: true,
            ip: clientIp,
          });
        } catch (err) {
          console.warn('[Onboarding] Bank details setup failed, will retry later:', err);
        }
      }

      // Strip sensitive data before storing
      const sanitizedResponse = { ...(account as Record<string, any>) };
      delete sanitizedResponse.legal_info;
      delete sanitizedResponse.settlements;
      delete sanitizedResponse.bank_details;

      // Create LinkedAccount record in DB
      const linkedAccount = await LinkedAccount.create({
        salon_id: salonId,
        razorpay_account_id: account.id,
        razorpay_product_id: productConfig?.id || null,
        status: account.status || 'created',
        legal_business_name,
        business_type: business_type || 'individual',
        contact_name,
        contact_email,
        contact_phone,
        pan,
        gst: gst || null,
        bank_account_number,
        bank_ifsc,
        bank_beneficiary_name,
        kyc_status: 'pending',
        razorpay_raw_response: sanitizedResponse,
      });

      // Update Salon with Razorpay fields
      await salon.update({
        razorpay_account_id: account.id,
        kyc_status: 'pending',
      });

      ApiResponse.created(res, {
        data: {
          linked_account_id: linkedAccount.id,
          razorpay_account_id: account.id,
          status: account.status,
          kyc_status: 'pending',
        },
        message: 'Linked account created successfully. KYC verification in progress.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /salons/:salonId/onboarding/linked-account
   * Get linked account status.
   */
  static async getLinkedAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;

      const linkedAccount = await LinkedAccount.findOne({
        where: { salon_id: salonId },
        attributes: {
          exclude: ['pan', 'bank_account_number', 'razorpay_raw_response'],
        },
      });

      if (!linkedAccount) {
        throw ApiError.notFound('No linked account found for this salon');
      }

      ApiResponse.success(res, {
        data: linkedAccount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /salons/:salonId/onboarding/linked-account
   * Update linked account details (bank/contact info).
   */
  static async updateLinkedAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;

      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (!linkedAccount) {
        throw ApiError.notFound('No linked account found for this salon');
      }

      const rzp = RazorpayService.getInstance();
      const updates: Record<string, any> = {};
      const dbUpdates: Record<string, any> = {};

      // Update contact info on Razorpay if provided
      if (req.body.contact_email || req.body.contact_phone) {
        const rzpUpdates: Record<string, any> = {};
        if (req.body.contact_email) {
          rzpUpdates.email = req.body.contact_email;
          dbUpdates.contact_email = req.body.contact_email;
        }
        if (req.body.contact_phone) {
          rzpUpdates.phone = req.body.contact_phone;
          dbUpdates.contact_phone = req.body.contact_phone;
        }
        await rzp.updateLinkedAccount(linkedAccount.razorpay_account_id, rzpUpdates);
      }

      // Update bank details via product config if provided
      if (req.body.bank_account_number && req.body.bank_ifsc && req.body.bank_beneficiary_name) {
        if (linkedAccount.razorpay_product_id) {
          await rzp.updateProductConfig(
            linkedAccount.razorpay_account_id,
            linkedAccount.razorpay_product_id,
            {
              settlements: {
                account_number: req.body.bank_account_number,
                ifsc_code: req.body.bank_ifsc,
                beneficiary_name: req.body.bank_beneficiary_name,
              },
              tnc_accepted: true,
              ip: req.ip || '127.0.0.1',
            }
          );
        }
        dbUpdates.bank_account_number = req.body.bank_account_number;
        dbUpdates.bank_ifsc = req.body.bank_ifsc;
        dbUpdates.bank_beneficiary_name = req.body.bank_beneficiary_name;
      }

      if (Object.keys(dbUpdates).length > 0) {
        await linkedAccount.update(dbUpdates);
      }

      ApiResponse.success(res, {
        data: { updated: Object.keys(dbUpdates) },
        message: 'Linked account updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /salons/:salonId/onboarding/linked-account/refresh
   * Fetch latest status from Razorpay and update local DB.
   */
  static async refreshKycStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;

      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (!linkedAccount) {
        throw ApiError.notFound('No linked account found for this salon');
      }

      const rzp = RazorpayService.getInstance();
      const account: any = await rzp.fetchLinkedAccount(linkedAccount.razorpay_account_id);

      // Map Razorpay account status to our KYC status
      let kycStatus = linkedAccount.kyc_status;
      let payoutEnabled = false;

      if (account.status === 'activated') {
        kycStatus = 'verified';
        payoutEnabled = true;
      } else if (account.status === 'suspended' || account.status === 'rejected') {
        kycStatus = 'failed';
        payoutEnabled = false;
      } else if (['created', 'needs_clarification', 'under_review'].includes(account.status)) {
        kycStatus = 'pending';
      }

      await linkedAccount.update({
        status: account.status,
        kyc_status: kycStatus,
        razorpay_raw_response: account,
        ...(account.status === 'activated' && !linkedAccount.activated_at ? { activated_at: new Date() } : {}),
      });

      // Update salon too
      await Salon.update(
        { kyc_status: kycStatus, payout_enabled: payoutEnabled },
        { where: { id: salonId } }
      );

      ApiResponse.success(res, {
        data: {
          razorpay_status: account.status,
          kyc_status: kycStatus,
          payout_enabled: payoutEnabled,
        },
        message: 'Status refreshed from Razorpay',
      });
    } catch (error) {
      next(error);
    }
  }
}
