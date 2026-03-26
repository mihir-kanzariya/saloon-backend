import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';
import config from '../config';
import { sequelize } from '../config/database';

import Payment from '../models/Payment';
import Booking from '../models/Booking';
import SalonEarning from '../models/SalonEarning';
import Withdrawal from '../models/Withdrawal';
import Salon from '../models/Salon';
import Transfer from '../models/Transfer';
import SettlementBatch from '../models/SettlementBatch';
import PayoutRequest from '../models/PayoutRequest';
import LinkedAccount from '../models/LinkedAccount';
import RazorpayService from '../services/razorpay.service';
import PricingService from '../services/pricing.service';
import { generateTxId } from '../utils/id-generator';
import { createEarningIfNotExists } from '../utils/earning.helper';
import { auditLog } from '../utils/audit-logger';

const MAX_BOOKING_AMOUNT = 100000; // ₹1 lakh

export class PaymentController {
  // Create Razorpay order
  static async createOrder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { booking_id, payment_type } = req.body;

      const booking = await Booking.findByPk(booking_id);
      if (!booking) throw ApiError.notFound('Booking not found');
      if (booking.customer_id !== req.user!.id) throw ApiError.forbidden('Access denied');

      let amount: number;
      if (payment_type === 'token') {
        amount = parseFloat(booking.token_amount);
      } else {
        amount = parseFloat(booking.total_amount);
      }

      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_BOOKING_AMOUNT) {
        throw ApiError.badRequest('Invalid payment amount');
      }

      // Duplicate payment prevention — return existing order if one created within 30 min
      const existingPayment = await Payment.findOne({
        where: {
          booking_id,
          payment_type: payment_type || 'full',
          status: 'created',
        tx_id: generateTxId('PAY'),
          created_at: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) },
        },
      });

      if (existingPayment) {
        ApiResponse.success(res, {
          data: {
            payment_id: existingPayment.id,
            order_id: existingPayment.razorpay_order_id,
            amount: Math.round(parseFloat(existingPayment.amount) * 100),
            currency: 'INR',
            key_id: config.razorpay.keyId,
          },
          message: 'Existing order returned',
        });
        return;
      }

      // Create real Razorpay order — NO transfers attached (deferred settlement per wiki)
      const rzp = RazorpayService.getInstance();
      const order = await rzp.createOrder({
        amount: rzp.toPaise(amount),
        currency: 'INR',
        receipt: booking.booking_number,
        notes: {
          booking_id,
          salon_id: booking.salon_id,
          payment_type: payment_type || 'full',
        },
      });

      const payment = await Payment.create({
        booking_id,
        user_id: req.user!.id,
        salon_id: booking.salon_id,
        razorpay_order_id: order.id,
        amount,
        payment_type: payment_type || 'full',
        status: 'created',
        tx_id: generateTxId('PAY'),
        notes: order.notes || {},
      });

      ApiResponse.success(res, {
        data: {
          payment_id: payment.id,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          key_id: config.razorpay.keyId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Verify payment
  static async verifyPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      const payment = await Payment.findOne({ where: { razorpay_order_id } });
      if (!payment) throw ApiError.notFound('Payment not found');
      if (payment.user_id !== req.user!.id) throw ApiError.forbidden('Access denied');

      // B.5: Idempotency check — prevent double processing
      if (payment.status === 'captured') {
        ApiResponse.success(res, { message: 'Payment already verified', data: payment });
        return;
      }

      // Verify signature with Razorpay
      const rzp = RazorpayService.getInstance();
      const isValid = rzp.verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!isValid) throw ApiError.badRequest('Invalid payment signature');

      // Fetch payment details from Razorpay to get fee/tax info
      let rzpPayment: any = null;
      try {
        rzpPayment = await rzp.fetchPayment(razorpay_payment_id);
      } catch (err) {
        console.warn('[Payment] Could not fetch payment details from Razorpay:', err);
      }

      await sequelize.transaction(async (t: any) => {
        await payment.update({
          razorpay_payment_id,
          razorpay_signature,
          status: 'captured',
          method: rzpPayment?.method || null,
          captured_at: new Date(),
          razorpay_fee: rzpPayment?.fee ? rzp.fromPaise(rzpPayment.fee) : null,
          razorpay_tax: rzpPayment?.tax ? rzp.fromPaise(rzpPayment.tax) : null,
        }, { transaction: t });

        // Update booking — confirm if awaiting_payment, update payment status
        const booking = await Booking.findByPk(payment.booking_id, { transaction: t });
        const newPaymentStatus = payment.payment_type === 'token' ? 'token_paid' : 'paid';

        const bookingUpdates: Record<string, any> = { payment_status: newPaymentStatus };

        // Pay-first flow: move from awaiting_payment → confirmed
        if (booking.status === 'awaiting_payment') {
          const salon = await Salon.findByPk(booking.salon_id, { attributes: ['booking_settings'], transaction: t });
          bookingUpdates.status = salon?.booking_settings?.auto_accept_bookings ? 'confirmed' : 'pending';
          bookingUpdates.payment_expires_at = null; // Clear hold timer
        }

        // Mark as pending_settlement for online payments that are fully paid
        if (newPaymentStatus === 'paid' && booking.payment_mode === 'online') {
          bookingUpdates.settlement_status = 'pending_settlement';
        }
        await booking.update(bookingUpdates, { transaction: t });

        // Create earning record if fully paid (atomic dedup via findOrCreate)
        if (newPaymentStatus === 'paid') {
          await createEarningIfNotExists({
            bookingId: booking.id,
            salonId: booking.salon_id,
            totalAmount: parseFloat(booking.total_amount),
            transaction: t,
          });
        }
      });

      auditLog('payment.verified', {
        payment_id: payment.id,
        booking_id: payment.booking_id,
        amount: payment.amount,
        method: payment.method,
      });

      ApiResponse.success(res, { message: 'Payment verified', data: payment });
    } catch (error) {
      next(error);
    }
  }

  // Get salon earnings
  static async getEarnings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { from, to, stylist_member_id } = req.query;
      const { page, limit, offset } = parsePagination(req.query);

      const where: any = { salon_id: salonId };
      if (from || to) {
        where.created_at = {};
        if (from) where.created_at[Op.gte] = new Date(from as string);
        if (to) where.created_at[Op.lte] = new Date(to as string);
      }

      const bookingInclude: any = {
        model: Booking,
        as: 'booking',
        attributes: ['id', 'booking_number', 'booking_date', 'total_amount', 'stylist_member_id'],
      };
      if (stylist_member_id) {
        bookingInclude.where = { stylist_member_id };
        bookingInclude.required = true;
      }

      const { rows: earnings, count } = await SalonEarning.findAndCountAll({
        where,
        include: [bookingInclude],
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      // Summary always covers the full filtered dataset (not just the current page)
      const summary = await SalonEarning.findOne({
        where,
        include: stylist_member_id ? [{ ...bookingInclude, attributes: [] }] : [],
        attributes: [
          [sequelize.fn('SUM', sequelize.col('SalonEarning.total_amount')), 'total_revenue'],
          [sequelize.fn('SUM', sequelize.col('commission_amount')), 'total_commission'],
          [sequelize.fn('SUM', sequelize.col('net_amount')), 'total_net'],
          [sequelize.fn('COUNT', sequelize.col('SalonEarning.id')), 'total_bookings'],
        ],
        raw: true,
      });

      ApiResponse.paginated(res, { data: { earnings, summary }, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Request withdrawal
  static async requestWithdrawal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { amount } = req.body;

      if (amount < config.app.minWithdrawalAmount) {
        throw ApiError.badRequest(`Minimum withdrawal amount is ${config.app.minWithdrawalAmount}`);
      }

      // Fetch saved bank details from LinkedAccount
      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (!linkedAccount || !linkedAccount.bank_account_number || !linkedAccount.bank_ifsc || !linkedAccount.bank_beneficiary_name) {
        throw ApiError.badRequest('Please set up your bank account first');
      }

      // Snapshot bank details at withdrawal time
      const bank_details = {
        holder_name: linkedAccount.bank_beneficiary_name,
        account_number: linkedAccount.bank_account_number,
        ifsc: linkedAccount.bank_ifsc,
        bank_name: linkedAccount.bank_name || null,
      };

      // Wrap balance check + withdrawal in a transaction with row locking
      const withdrawal = await sequelize.transaction(async (t: any) => {
        // Lock earning rows first via subquery, then aggregate
        // (FOR UPDATE is not allowed with aggregate functions in PostgreSQL)
        const [sumResult]: any = await sequelize.query(
          `SELECT COALESCE(SUM(net_amount), 0) AS available
           FROM (
             SELECT net_amount FROM salon_earnings
             WHERE salon_id = :salonId AND status IN ('pending', 'settled')
             FOR UPDATE
           ) AS locked`,
          { replacements: { salonId }, transaction: t, type: (sequelize as any).QueryTypes.SELECT }
        );

        const available = parseFloat(sumResult?.available || '0');
        if (amount > available) throw ApiError.badRequest('Insufficient balance');

        return await Withdrawal.create({
          salon_id: salonId,
          requested_by: req.user!.id,
          amount,
          bank_details,
        }, { transaction: t });
      });

      ApiResponse.created(res, { data: withdrawal, message: 'Withdrawal requested' });
    } catch (error) {
      next(error);
    }
  }

  // Get withdrawals
  static async getWithdrawals(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await Withdrawal.findAndCountAll({
        where: { salon_id: salonId },
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });
      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Get incentive progress for salon
  static async getIncentiveProgress(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysRemaining = Math.ceil((monthEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Count completed bookings this month
      const count = await Booking.count({
        where: {
          salon_id: salonId,
          status: 'completed',
          booking_date: { [Op.gte]: monthStart.toISOString().split('T')[0] },
        },
      });

      // Get past incentive payouts
      const pastIncentives = await PayoutRequest.findAll({
        where: { salon_id: salonId, type: 'incentive' },
        order: [['created_at', 'DESC']],
        limit: 6,
      });

      ApiResponse.success(res, {
        data: {
          current_month_bookings: count,
          threshold: config.app.incentiveBookingThreshold,
          bonus_amount: config.app.incentiveAmount,
          eligible: count >= config.app.incentiveBookingThreshold,
          days_remaining: daysRemaining,
          month: monthStart.toISOString().split('T')[0],
          past_incentives: pastIncentives,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get settlement history for salon
  static async getSettlements(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await Transfer.findAndCountAll({
        where: { salon_id: salonId },
        order: [['created_at', 'DESC']],
        limit,
        offset,
        include: [
          { model: SettlementBatch, as: 'settlement_batch', attributes: ['id', 'batch_number', 'period_start', 'period_end', 'status'] },
        ],
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }
}
