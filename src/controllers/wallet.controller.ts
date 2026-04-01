import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';
import { generateTxId } from '../utils/id-generator';
import { auditLog } from '../utils/audit-logger';
import { WalletService } from '../services/wallet.service';
import RazorpayService from '../services/razorpay.service';
import Wallet from '../models/Wallet';
import WalletLedger from '../models/WalletLedger';
import Withdrawal from '../models/Withdrawal';
import LinkedAccount from '../models/LinkedAccount';
import config from '../config';

export class WalletController {
  /**
   * GET /wallet/salon/:salonId/summary
   * Get wallet balance summary
   */
  static async getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const summary = await WalletService.getWalletSummary(salonId);

      // Get pending withdrawal total
      const pendingWithdrawals = await Withdrawal.sum('amount', {
        where: { salon_id: salonId, status: { [Op.in]: ['pending', 'processing'] } },
      }) || 0;

      ApiResponse.success(res, {
        data: {
          ...summary,
          pending_withdrawals: pendingWithdrawals,
          withdrawable_balance: Math.max(0, summary.available_balance - pendingWithdrawals),
          min_withdrawal: config.app.minWithdrawalAmount,
        },
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /wallet/salon/:salonId/ledger
   * Get transaction ledger (all credits and debits)
   */
  static async getLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { page, limit } = parsePagination(req.query);
      const type = (req.query.type as string) || undefined;

      const where: any = { salon_id: salonId };
      if (type) where.type = type;

      const { rows, count } = await WalletLedger.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) { next(error); }
  }

  /**
   * POST /wallet/salon/:salonId/withdraw
   * Request a withdrawal using saved bank account
   */
  static async requestWithdrawal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { amount } = req.body;

      if (!amount || amount < config.app.minWithdrawalAmount) {
        throw ApiError.badRequest(`Minimum withdrawal is ₹${config.app.minWithdrawalAmount}`);
      }

      // Verify linked account exists and is activated
      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (!linkedAccount || !linkedAccount.bank_account_number) {
        throw ApiError.badRequest('Please set up your bank account before requesting a withdrawal');
      }
      if (!linkedAccount.razorpay_account_id) {
        throw ApiError.badRequest('Razorpay linked account not set up. Please complete KYC onboarding.');
      }
      if (linkedAccount.status !== 'activated') {
        throw ApiError.badRequest(`Linked account is "${linkedAccount.status}". Withdrawals require an activated account.`);
      }

      // Step 1: Create withdrawal record + debit wallet (atomic)
      const withdrawal = await sequelize.transaction(async (t) => {
        const w = await Withdrawal.create({
          tx_id: generateTxId('WDR'),
          salon_id: salonId,
          requested_by: req.user!.id,
          amount,
          bank_details: {
            account_number: linkedAccount.bank_account_number,
            ifsc_code: linkedAccount.bank_ifsc,
            account_holder_name: linkedAccount.bank_beneficiary_name,
            bank_name: linkedAccount.bank_name || '',
          },
          status: 'pending',
        }, { transaction: t });

        await WalletService.debitWithdrawal({
          salonId,
          amount,
          withdrawalId: w.id,
          transaction: t,
        });

        return w;
      });

      auditLog('withdrawal.requested', {
        salon_id: salonId,
        amount,
        withdrawal_id: withdrawal.id,
        tx_id: withdrawal.tx_id,
      });

      // Step 2: Initiate Razorpay transfer (outside DB transaction)
      // If this fails, the withdrawal stays 'pending' and is retried by the cron
      try {
        const rzp = RazorpayService.getInstance();
        const transfer = await rzp.createDirectTransfer({
          account: linkedAccount.razorpay_account_id,
          amount: rzp.toPaise(amount),
          currency: 'INR',
          notes: {
            withdrawal_id: withdrawal.id,
            salon_id: salonId,
            tx_id: withdrawal.tx_id,
          },
        });

        await withdrawal.update({
          status: 'processing',
          transaction_reference: transfer.id,
        });

        auditLog('withdrawal.transfer_initiated', {
          withdrawal_id: withdrawal.id,
          razorpay_transfer_id: transfer.id,
          amount,
        });
      } catch (transferErr: any) {
        // Transfer failed — withdrawal stays 'pending', will be retried by cron
        console.error(`[Wallet] Razorpay transfer failed for withdrawal ${withdrawal.id}:`, transferErr.message);
        auditLog('withdrawal.transfer_failed', {
          withdrawal_id: withdrawal.id,
          error: transferErr.message,
        });
        // Don't throw — the wallet is already debited, cron will retry
      }

      // Re-fetch to return latest status
      await withdrawal.reload();

      ApiResponse.created(res, {
        data: withdrawal,
        message: withdrawal.status === 'processing'
          ? 'Withdrawal initiated. Funds will reach your bank within 2-3 business days.'
          : 'Withdrawal queued. Transfer will be retried shortly.',
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /wallet/salon/:salonId/withdrawals
   * Get withdrawal history
   */
  static async getWithdrawals(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { page, limit } = parsePagination(req.query);

      const { rows, count } = await Withdrawal.findAndCountAll({
        where: { salon_id: salonId },
        order: [['created_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) { next(error); }
  }
}
