import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import PromoCode from '../models/PromoCode';
import PromoUsage from '../models/PromoUsage';

export class PromoController {
  // POST /promo-codes/validate
  static async validate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code, salon_id, subtotal } = req.body;
      const userId = req.user!.id;
      const today = new Date().toISOString().split('T')[0];

      // 1. Find promo by code (uppercase, case-insensitive)
      const promo = await PromoCode.findOne({
        where: { code: code.trim().toUpperCase() },
      });

      if (!promo) {
        ApiResponse.success(res, { data: { valid: false, reason: 'Promo code not found' } });
        return;
      }

      // 2. Check is_active
      if (!promo.is_active) {
        ApiResponse.success(res, { data: { valid: false, reason: 'This promo code is no longer active' } });
        return;
      }

      // 3. Check valid_from <= today <= valid_until
      if (today < promo.valid_from || today > promo.valid_until) {
        ApiResponse.success(res, { data: { valid: false, reason: 'This promo code has expired' } });
        return;
      }

      // 4. If max_uses > 0, check current_uses < max_uses
      if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
        ApiResponse.success(res, { data: { valid: false, reason: 'This promo code has reached its usage limit' } });
        return;
      }

      // 5. If salon_id set on promo, check match (null = global, applies to all)
      if (promo.salon_id && promo.salon_id !== salon_id) {
        ApiResponse.success(res, { data: { valid: false, reason: 'This promo code is not valid for this salon' } });
        return;
      }

      // 6. Check min_order <= subtotal
      const subtotalNum = parseFloat(subtotal);
      const minOrder = parseFloat(promo.min_order);
      if (minOrder > 0 && subtotalNum < minOrder) {
        ApiResponse.success(res, {
          data: { valid: false, reason: `Minimum order amount is \u20B9${minOrder.toFixed(0)} for this promo code` },
        });
        return;
      }

      // 7. Check PromoUsage doesn't exist for user_id + promo_code_id
      const existingUsage = await PromoUsage.findOne({
        where: { user_id: userId, promo_code_id: promo.id },
      });
      if (existingUsage) {
        ApiResponse.success(res, { data: { valid: false, reason: 'You have already used this promo code' } });
        return;
      }

      // 8. Calculate discount
      let discountAmount: number;
      const discountValue = parseFloat(promo.discount_value);

      if (promo.discount_type === 'percent') {
        discountAmount = (subtotalNum * discountValue) / 100;
        const maxDiscount = promo.max_discount ? parseFloat(promo.max_discount) : Infinity;
        discountAmount = Math.min(discountAmount, maxDiscount);
      } else {
        // flat discount
        discountAmount = Math.min(discountValue, subtotalNum);
      }

      // Round to 2 decimal places
      discountAmount = Math.round(discountAmount * 100) / 100;
      const finalTotal = Math.round((subtotalNum - discountAmount) * 100) / 100;

      // 9. Return valid result
      ApiResponse.success(res, {
        data: {
          valid: true,
          discount_amount: discountAmount,
          promo_code_id: promo.id,
          code: promo.code,
          discount_type: promo.discount_type,
          discount_value: discountValue,
          final_total: finalTotal,
          description: promo.description,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
