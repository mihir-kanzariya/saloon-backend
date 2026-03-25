import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { Payment } from '../models';
import RefundService from '../services/refund.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

export class RefundController {
  /**
   * POST /payments/:paymentId/refund
   * Initiate a refund (admin or salon owner).
   */
  static async initiateRefund(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { amount, reason } = req.body;

      const payment = await Payment.findByPk(paymentId);
      if (!payment) throw ApiError.notFound('Payment not found');

      if (payment.status !== 'captured') {
        throw ApiError.badRequest('Can only refund captured payments');
      }

      if (!reason) {
        throw ApiError.badRequest('Refund reason is required');
      }

      const result = await RefundService.processRefund({
        bookingId: payment.booking_id,
        amount: amount ? parseFloat(amount) : undefined,
        reason,
        initiatedBy: req.user!.id,
      });

      ApiResponse.success(res, {
        data: result,
        message: `Refund processed via ${result.path} path`,
      });
    } catch (error) {
      next(error);
    }
  }
}
