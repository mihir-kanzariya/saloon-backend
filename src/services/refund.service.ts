import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Payment, Booking, SalonEarning } from '../models';
import RazorpayService from './razorpay.service';
import { ApiError } from '../utils/apiError';
import { auditLog } from '../utils/audit-logger';
import { WalletService } from './wallet.service';
import config from '../config';



interface RefundResult {
  path: 'pre_transfer' | 'post_transfer';
  refundAmount: number;
  razorpayRefundId?: string;
  adjustmentCreated?: boolean;
}

class RefundService {
  /**
   * Process a refund — auto-detects pre-transfer or post-transfer path.
   */
  static async processRefund(params: {
    bookingId: string;
    amount?: number; // null = full refund
    reason: string;
    initiatedBy: string;
  }): Promise<RefundResult> {
    // Use transaction with row lock to prevent concurrent refunds
    return sequelize.transaction(async (t) => {
      const booking = await Booking.findByPk(params.bookingId, { transaction: t, lock: true });
      if (!booking) {
        throw ApiError.notFound('Booking not found');
      }

      // Find and lock the captured payment
      const payment = await Payment.findOne({
        where: { booking_id: params.bookingId, status: 'captured' },
        transaction: t,
        lock: true,
      });

      if (!payment) {
        throw ApiError.badRequest('No captured payment found for this booking');
      }

      // Check refund window
      const capturedAt = payment.captured_at || payment.updated_at;
      const hoursSinceCapture = (Date.now() - new Date(capturedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCapture > config.app.refundWindowHours) {
        throw ApiError.badRequest(`Refund window of ${config.app.refundWindowHours} hours has expired`);
      }

      const refundAmount = params.amount || parseFloat(payment.amount);

      // Validate refund amount
      if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > (config.app.maxBookingAmount || 100000)) {
        throw ApiError.badRequest('Invalid refund amount');
      }

      // Check cumulative refunds don't exceed payment amount
      const alreadyRefunded = parseFloat(payment.refund_amount || 0);
      if (alreadyRefunded + refundAmount > parseFloat(payment.amount)) {
        throw ApiError.badRequest('Refund amount exceeds remaining payment amount');
      }

      auditLog('refund.initiated', {
        booking_id: params.bookingId,
        amount: refundAmount,
        path: booking.settlement_status === 'settled' ? 'post_transfer' : 'pre_transfer',
        initiated_by: params.initiatedBy,
      });

      if (booking.settlement_status === 'settled') {
        return RefundService.refundPostTransfer({ booking, payment, amount: refundAmount, reason: params.reason, initiatedBy: params.initiatedBy });
      } else {
        return RefundService.refundPreTransfer({ booking, payment, amount: refundAmount, reason: params.reason, initiatedBy: params.initiatedBy });
      }
    });
  }

  /**
   * Case A: Transfer NOT done yet — call Razorpay refund API directly.
   */
  private static async refundPreTransfer(params: {
    booking: any;
    payment: any;
    amount: number;
    reason: string;
    initiatedBy: string;
  }): Promise<RefundResult> {
    const rzp = RazorpayService.getInstance();

    const rzpRefund = await rzp.createRefund(params.payment.razorpay_payment_id, {
      amount: rzp.toPaise(params.amount),
      speed: 'normal',
      notes: {
        booking_id: params.booking.id,
        reason: params.reason,
        initiated_by: params.initiatedBy,
      },
    });

    // Update payment record
    await sequelize.transaction(async (t) => {
      const isFullRefund = params.amount >= parseFloat(params.payment.amount);

      await params.payment.update({
        refund_amount: parseFloat(params.payment.refund_amount || 0) + params.amount,
        refund_id: rzpRefund.id,
        refund_status: isFullRefund ? 'full' : 'partial',
        status: isFullRefund ? 'refunded' : 'captured',
      }, { transaction: t });

      await params.booking.update({
        payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
        settlement_status: 'not_applicable',
      }, { transaction: t });

      // Delete earning record if it exists and hasn't been settled
      await SalonEarning.destroy({
        where: {
          booking_id: params.booking.id,
          status: { [Op.in]: ['pending', 'ready_for_settlement'] },
        },
        transaction: t,
      });
    });

    return {
      path: 'pre_transfer',
      refundAmount: params.amount,
      razorpayRefundId: rzpRefund.id,
    };
  }

  /**
   * Case B: Transfer already done — create a negative adjustment for next settlement.
   */
  private static async refundPostTransfer(params: {
    booking: any;
    payment: any;
    amount: number;
    reason: string;
    initiatedBy: string;
  }): Promise<RefundResult> {
    const rzp = RazorpayService.getInstance();

    // Still refund the customer from platform account
    const rzpRefund = await rzp.createRefund(params.payment.razorpay_payment_id, {
      amount: rzp.toPaise(params.amount),
      speed: 'normal',
      notes: {
        booking_id: params.booking.id,
        reason: params.reason,
        post_transfer_adjustment: 'true',
      },
    });

    await sequelize.transaction(async (t) => {
      const isFullRefund = params.amount >= parseFloat(params.payment.amount);

      // Update payment
      await params.payment.update({
        refund_amount: parseFloat(params.payment.refund_amount || 0) + params.amount,
        refund_id: rzpRefund.id,
        refund_status: isFullRefund ? 'full' : 'partial',
      }, { transaction: t });

      // Update booking
      await params.booking.update({
        payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
        settlement_status: 'refund_adjusted',
      }, { transaction: t });

      // Update the earning record with a refund adjustment
      // This amount will be deducted from the next settlement cycle
      const earning = await SalonEarning.findOne({
        where: { booking_id: params.booking.id },
        transaction: t,
      });

      if (earning) {
        await earning.update({
          refund_adjustment: parseFloat(earning.refund_adjustment || 0) + params.amount,
          status: 'refund_adjusted',
        }, { transaction: t });
      }
    });

    return {
      path: 'post_transfer',
      refundAmount: params.amount,
      razorpayRefundId: rzpRefund.id,
      adjustmentCreated: true,
    };
  }
}

export default RefundService;
