import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { SchedulingService } from '../services/scheduling.service';
import { SmartSchedulingService } from '../services/smart-scheduling.service';
import { NotificationService } from '../services/notification.service';
import { generateBookingNumber, addMinutesToTime, parsePagination } from '../utils/helpers';
import { generateTxId } from '../utils/id-generator';
import config from '../config';

import Booking from '../models/Booking';
import BookingService from '../models/BookingService';
import Service from '../models/Service';
import Salon from '../models/Salon';
import SalonMember from '../models/SalonMember';
import User from '../models/User';
import ChatRoom from '../models/ChatRoom';
import Review from '../models/Review';
import Payment from '../models/Payment';
import SalonEarning from '../models/SalonEarning';
import PromoCode from '../models/PromoCode';
import PromoUsage from '../models/PromoUsage';
import RefundService from '../services/refund.service';

export class BookingController {
  // Create booking
  static async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salon_id, service_ids, booking_date, start_time, stylist_member_id, payment_mode, customer_notes, slot_type: requestedSlotType } = req.body;

      // Validate salon
      const salon = await Salon.findByPk(salon_id);
      if (!salon || !salon.is_active) throw ApiError.notFound('Salon not found or inactive');

      // Fraud control: max bookings per salon per day
      const todayBookingCount = await Booking.count({
        where: {
          salon_id,
          booking_date,
          status: { [Op.notIn]: ['cancelled'] },
        },
      });
      if (todayBookingCount >= config.app.maxBookingsPerSalonPerDay) {
        throw ApiError.tooManyRequests('This salon has reached the maximum bookings for this date');
      }

      // Fraud control: repeated fake users (max 3 bookings from same user to same salon per day)
      const userSalonBookings = await Booking.count({
        where: {
          customer_id: req.user!.id,
          salon_id,
          booking_date,
          status: { [Op.notIn]: ['cancelled'] },
        },
      });
      if (userSalonBookings >= 3) {
        throw ApiError.tooManyRequests('Maximum booking limit reached for this salon today');
      }

      // Fetch services
      const services = await Service.findAll({
        where: { id: { [Op.in]: service_ids }, salon_id, is_active: true },
      });
      if (services.length !== service_ids.length) throw ApiError.badRequest('One or more services not found');

      // Calculate total duration and amount
      const totalDuration = services.reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
      const subtotal = services.reduce((sum: number, s: any) => sum + parseFloat(s.discounted_price || s.price), 0);
      const endTime = addMinutesToTime(start_time, totalDuration);

      // Determine stylist
      let assignedStylistId = stylist_member_id || null;
      let isAutoAssigned = false;

      if (!assignedStylistId) {
        assignedStylistId = await SchedulingService.autoAssignStylist(
          salon_id, booking_date, start_time, endTime, service_ids
        );
        isAutoAssigned = true;
      }

      if (!assignedStylistId) throw ApiError.badRequest('No stylist available for the selected time');

      // Verify slot availability
      const dayOfWeek = new Date(booking_date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const buffer = salon.booking_settings.buffer_between_bookings_minutes || 5;
      const isAvailable = await SchedulingService.isStylistAvailable(
        assignedStylistId, booking_date, dayOfWeek, start_time, addMinutesToTime(start_time, totalDuration + buffer)
      );
      if (!isAvailable) throw ApiError.badRequest('Selected time slot is no longer available');

      // Smart slot discount
      let smartSlotType = 'regular';
      let smartDiscountAmount = 0;
      let finalAmount = subtotal;

      if (requestedSlotType && requestedSlotType !== 'regular') {
        const verification = await SmartSchedulingService.verifySmartSlot({
          salonId: salon_id,
          date: booking_date,
          startTime: start_time,
          serviceDuration: totalDuration,
          servicePrice: subtotal,
          stylistMemberId: assignedStylistId,
        });
        if (verification.isSmartSlot) {
          smartSlotType = verification.slotType;
          smartDiscountAmount = verification.discountAmount;
          finalAmount = verification.finalPrice;
        }
      }

      // Determine initial status
      const initialStatus = salon.booking_settings.auto_accept_bookings ? 'confirmed' : 'pending';
      const tokenAmount = salon.booking_settings.require_prepayment ? salon.booking_settings.token_amount : 0;

      // C.6: Create booking in transaction with advisory lock to prevent race conditions
      const booking = await sequelize.transaction(async (t: any) => {
        // Advisory lock on (stylist_member_id, booking_date) hash to prevent concurrent inserts
        const lockKey = Buffer.from(`${assignedStylistId}:${booking_date}`).reduce(
          (hash, byte) => ((hash << 5) - hash + byte) | 0, 0
        );
        await sequelize.query('SELECT pg_advisory_xact_lock(:lockKey)', {
          replacements: { lockKey },
          transaction: t,
        });

        // Re-check availability inside the transaction
        const conflicting = await Booking.findOne({
          where: {
            stylist_member_id: assignedStylistId,
            booking_date,
            status: { [Op.in]: ['awaiting_payment', 'pending', 'confirmed', 'in_progress'] },
            start_time: { [Op.lt]: endTime },
            end_time: { [Op.gt]: start_time },
          },
          transaction: t,
        });
        if (conflicting) throw ApiError.conflict('Selected time slot is no longer available');

        const newBooking = await Booking.create({
          booking_number: generateBookingNumber(),
          tx_id: generateTxId('BK'),
          customer_id: req.user!.id,
          salon_id,
          stylist_member_id: assignedStylistId,
          booking_date,
          start_time,
          end_time: endTime,
          total_duration_minutes: totalDuration,
          subtotal,
          discount_amount: smartDiscountAmount,
          total_amount: finalAmount,
          payment_mode: payment_mode || 'pay_at_salon',
          token_amount: tokenAmount,
          status: initialStatus,
          is_auto_assigned: isAutoAssigned,
          customer_notes: customer_notes || null,
          slot_type: smartSlotType,
          smart_discount: smartDiscountAmount,
        }, { transaction: t });

        // Create booking services
        const bookingServices = services.map((s: any) => ({
          booking_id: newBooking.id,
          service_id: s.id,
          service_name: s.name,
          price: parseFloat(s.discounted_price || s.price),
          duration_minutes: s.duration_minutes,
        }));
        await BookingService.bulkCreate(bookingServices, { transaction: t });

        // Create chat room
        await ChatRoom.create({
          booking_id: newBooking.id,
          customer_id: req.user!.id,
          salon_id,
        }, { transaction: t });

        return newBooking;
      });

      // Fetch full booking with associations
      const fullBooking = await Booking.findByPk(booking.id, {
        include: [
          { model: BookingService, as: 'services' },
          { model: Salon, as: 'salon', attributes: ['id', 'name', 'phone', 'address'] },
          {
            model: SalonMember, as: 'stylist',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }],
          },
        ],
      });

      // Send notifications
      await NotificationService.sendToSalonMembers({
        salonId: salon_id,
        title: 'New Booking',
        body: `New booking #${booking.booking_number} for ${booking_date} at ${start_time}`,
        type: 'booking_created',
        data: { booking_id: booking.id },
        roles: ['owner', 'manager', 'receptionist'],
      });

      ApiResponse.created(res, { data: fullBooking, message: 'Booking created successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /bookings/pay-and-book
   * Combined booking + payment order creation.
   * Creates booking with status='awaiting_payment' (10-min hold),
   * creates Razorpay order, and returns both.
   * Slot is held until payment completes or expires.
   */
  static async createWithPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salon_id, service_ids, booking_date, start_time, stylist_member_id, customer_notes, promo_code, slot_type: requestedSlotType } = req.body;

      const salon = await Salon.findByPk(salon_id);
      if (!salon || !salon.is_active) throw ApiError.notFound('Salon not found or inactive');

      // Fraud controls
      const todayBookingCount = await Booking.count({
        where: { salon_id, booking_date, status: { [Op.notIn]: ['cancelled'] } },
      });
      if (todayBookingCount >= config.app.maxBookingsPerSalonPerDay) {
        throw ApiError.tooManyRequests('This salon has reached the maximum bookings for this date');
      }

      const userSalonBookings = await Booking.count({
        where: { customer_id: req.user!.id, salon_id, booking_date, status: { [Op.notIn]: ['cancelled'] } },
      });
      if (userSalonBookings >= 3) {
        throw ApiError.tooManyRequests('Maximum booking limit reached for this salon today');
      }

      const services = await Service.findAll({
        where: { id: { [Op.in]: service_ids }, salon_id, is_active: true },
      });
      if (services.length !== service_ids.length) throw ApiError.badRequest('One or more services not found');

      const totalDuration = services.reduce((sum: number, s: any) => sum + s.duration_minutes, 0);
      const subtotal = services.reduce((sum: number, s: any) => sum + parseFloat(s.discounted_price || s.price), 0);
      const endTime = addMinutesToTime(start_time, totalDuration);

      let assignedStylistId = stylist_member_id || null;
      let isAutoAssigned = false;
      if (!assignedStylistId) {
        assignedStylistId = await SchedulingService.autoAssignStylist(salon_id, booking_date, start_time, endTime, service_ids);
        isAutoAssigned = true;
      }
      if (!assignedStylistId) throw ApiError.badRequest('No stylist available for the selected time');

      const dayOfWeek = new Date(booking_date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const buffer = salon.booking_settings.buffer_between_bookings_minutes || 5;
      const isAvailable = await SchedulingService.isStylistAvailable(
        assignedStylistId, booking_date, dayOfWeek, start_time, addMinutesToTime(start_time, totalDuration + buffer)
      );
      if (!isAvailable) throw ApiError.badRequest('Selected time slot is no longer available');

      // Promo code validation (re-validate to prevent tampering)
      let discountAmount = 0;
      let promoCodeId: string | null = null;

      if (promo_code) {
        const today = new Date().toISOString().split('T')[0];
        const promo = await PromoCode.findOne({
          where: { code: promo_code.toUpperCase(), is_active: true },
        });
        if (!promo) throw ApiError.badRequest('Invalid promo code');

        if (today < promo.valid_from || today > promo.valid_until) {
          throw ApiError.badRequest('This promo code has expired');
        }
        if (promo.max_uses > 0 && promo.current_uses >= promo.max_uses) {
          throw ApiError.badRequest('This promo code has reached its usage limit');
        }
        if (promo.salon_id && promo.salon_id !== salon_id) {
          throw ApiError.badRequest('This promo code is not valid for this salon');
        }
        const minOrder = parseFloat(promo.min_order);
        if (minOrder > 0 && subtotal < minOrder) {
          throw ApiError.badRequest(`Minimum order amount is \u20B9${minOrder.toFixed(0)} for this promo code`);
        }
        const existingUsage = await PromoUsage.findOne({
          where: { user_id: req.user!.id, promo_code_id: promo.id },
        });
        if (existingUsage) throw ApiError.badRequest('You have already used this promo code');

        // Calculate discount
        const discountValue = parseFloat(promo.discount_value);
        if (promo.discount_type === 'percent') {
          discountAmount = (subtotal * discountValue) / 100;
          const maxDiscount = promo.max_discount ? parseFloat(promo.max_discount) : Infinity;
          discountAmount = Math.min(discountAmount, maxDiscount);
        } else {
          discountAmount = Math.min(discountValue, subtotal);
        }
        discountAmount = Math.round(discountAmount * 100) / 100;
        promoCodeId = promo.id;
      }

      // Smart slot discount (only if no promo code or promo gives less discount)
      let smartSlotType = 'regular';
      let smartDiscountAmount = 0;

      if (requestedSlotType && requestedSlotType !== 'regular') {
        const verification = await SmartSchedulingService.verifySmartSlot({
          salonId: salon_id,
          date: booking_date,
          startTime: start_time,
          serviceDuration: totalDuration,
          servicePrice: subtotal,
          stylistMemberId: assignedStylistId,
        });

        if (verification.isSmartSlot) {
          smartSlotType = verification.slotType;
          smartDiscountAmount = verification.discountAmount;

          // Use the BETTER discount for customer (smart vs promo, not both)
          if (smartDiscountAmount > discountAmount) {
            discountAmount = smartDiscountAmount;
            promoCodeId = null; // smart discount wins over promo
          }
        }
      }

      const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;

      // Payment hold expiry
      const holdMinutes = config.app.paymentHoldMinutes || 10;
      const paymentExpiresAt = new Date(Date.now() + holdMinutes * 60 * 1000);

      // Create booking with awaiting_payment + Razorpay order in transaction
      const result = await sequelize.transaction(async (t: any) => {
        const lockKey = Buffer.from(`${assignedStylistId}:${booking_date}`).reduce(
          (hash: number, byte: number) => ((hash << 5) - hash + byte) | 0, 0
        );
        await sequelize.query('SELECT pg_advisory_xact_lock(:lockKey)', { replacements: { lockKey }, transaction: t });

        // Conflict check (includes awaiting_payment holds)
        const conflicting = await Booking.findOne({
          where: {
            stylist_member_id: assignedStylistId,
            booking_date,
            status: { [Op.in]: ['awaiting_payment', 'pending', 'confirmed', 'in_progress'] },
            start_time: { [Op.lt]: endTime },
            end_time: { [Op.gt]: start_time },
          },
          transaction: t,
        });
        if (conflicting) throw ApiError.conflict('Selected time slot is no longer available');

        const newBooking = await Booking.create({
          booking_number: generateBookingNumber(),
          tx_id: generateTxId('BK'),
          customer_id: req.user!.id,
          salon_id,
          stylist_member_id: assignedStylistId,
          booking_date,
          start_time,
          end_time: endTime,
          total_duration_minutes: totalDuration,
          subtotal,
          promo_code_id: promoCodeId,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          payment_mode: 'online',
          token_amount: 0,
          status: 'awaiting_payment',
          payment_expires_at: paymentExpiresAt,
          is_auto_assigned: isAutoAssigned,
          customer_notes: customer_notes || null,
          slot_type: smartSlotType,
          smart_discount: smartDiscountAmount,
        }, { transaction: t });

        // Create booking services
        const bookingServices = services.map((s: any) => ({
          booking_id: newBooking.id,
          service_id: s.id,
          service_name: s.name,
          price: parseFloat(s.discounted_price || s.price),
          duration_minutes: s.duration_minutes,
        }));
        await BookingService.bulkCreate(bookingServices, { transaction: t });

        // Create promo usage record and increment counter
        if (promoCodeId) {
          await PromoUsage.create({
            user_id: req.user!.id,
            promo_code_id: promoCodeId,
            booking_id: newBooking.id,
            discount_amount: discountAmount,
          }, { transaction: t });

          await PromoCode.increment('current_uses', {
            by: 1,
            where: { id: promoCodeId },
            transaction: t,
          });
        }

        // Create payment record + Razorpay order
        const RazorpayService = (await import('../services/razorpay.service')).default;
        const rzp = RazorpayService.getInstance();

        const order = await rzp.createOrder({
          amount: rzp.toPaise(totalAmount),
          currency: 'INR',
          receipt: newBooking.booking_number,
          notes: { booking_id: newBooking.id, salon_id, payment_type: 'full' },
        });

        await Payment.create({
          booking_id: newBooking.id,
          user_id: req.user!.id,
          salon_id,
          razorpay_order_id: order.id,
          amount: totalAmount,
          payment_type: 'full',
          status: 'created',
        }, { transaction: t });

        return { booking: newBooking, orderId: order.id, orderAmount: order.amount };
      });

      // Fetch full booking
      const fullBooking = await Booking.findByPk(result.booking.id, {
        include: [
          { model: BookingService, as: 'services' },
          { model: Salon, as: 'salon', attributes: ['id', 'name', 'phone', 'address'] },
          { model: SalonMember, as: 'stylist', include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }] },
        ],
      });

      ApiResponse.created(res, {
        data: {
          booking: fullBooking,
          payment: {
            order_id: result.orderId,
            amount: result.orderAmount,
            currency: 'INR',
            key_id: config.razorpay.keyId,
          },
        },
        message: `Booking created. Complete payment within ${holdMinutes} minutes to confirm.`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get available slots
  static async getAvailableSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { date, duration, stylist_member_id } = req.query;

      if (!date || !duration) throw ApiError.badRequest('Date and duration are required');

      const slots = await SchedulingService.getAvailableSlots(
        salonId,
        String(date),
        parseInt(String(duration), 10),
        stylist_member_id ? String(stylist_member_id) : undefined
      );

      ApiResponse.success(res, { data: slots });
    } catch (error) {
      next(error);
    }
  }

  // Get smart slots with gap-filling pricing
  static async getSmartSlots(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { date, duration, price, stylist_member_id, display_interval } = req.query;

      if (!date || !duration) throw ApiError.badRequest('Date and duration are required');

      const servicePrice = price ? parseFloat(String(price)) : 0;
      const displayInterval = display_interval ? parseInt(String(display_interval), 10) : undefined;
      const result = await SmartSchedulingService.getSmartSlots({
        salonId,
        date: String(date),
        serviceDuration: parseInt(String(duration), 10),
        servicePrice,
        stylistMemberId: stylist_member_id ? String(stylist_member_id) : undefined,
        displayInterval,
      });

      ApiResponse.success(res, { data: result });
    } catch (error) {
      next(error);
    }
  }

  // Get customer bookings
  static async getMyBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = req.query;
      const { page, limit, offset } = parsePagination(req.query);
      const where: any = { customer_id: req.user!.id };

      // Handle virtual status 'upcoming' (maps to awaiting_payment/pending/confirmed/in_progress)
      if (status === 'upcoming') {
        where.status = { [Op.in]: ['awaiting_payment', 'pending', 'confirmed', 'in_progress'] };
      } else if (status) {
        where.status = status;
      }

      const { rows, count } = await Booking.findAndCountAll({
        where,
        include: [
          { model: BookingService, as: 'services' },
          { model: Salon, as: 'salon', attributes: ['id', 'name', 'cover_image', 'address', 'phone'] },
          {
            model: SalonMember, as: 'stylist',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }],
          },
        ],
        order: [['booking_date', 'DESC'], ['start_time', 'DESC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Get booking by ID
  static async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const booking = await Booking.findByPk(req.params.bookingId, {
        include: [
          { model: BookingService, as: 'services' },
          { model: Salon, as: 'salon' },
          {
            model: SalonMember, as: 'stylist',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo', 'phone'] }],
          },
          { model: User, as: 'customer', attributes: ['id', 'name', 'phone', 'profile_photo'] },
          { model: Review, as: 'review', required: false },
          { model: ChatRoom, as: 'chat_room', attributes: ['id', 'is_active'] },
          { model: Payment, as: 'payments', required: false },
        ],
      });

      if (!booking) throw ApiError.notFound('Booking not found');

      // Ensure user has access
      if (booking.customer_id !== req.user!.id) {
        const member = await SalonMember.findOne({
          where: { salon_id: booking.salon_id, user_id: req.user!.id, is_active: true },
        });
        if (!member) throw ApiError.forbidden('Access denied');
      }

      // F.5: Add has_review field
      const bookingData = booking.toJSON();
      bookingData.has_review = bookingData.review != null;

      ApiResponse.success(res, { data: bookingData });
    } catch (error) {
      next(error);
    }
  }

  // Update booking status (salon side)
  static async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { bookingId } = req.params;
      const { status, cancellation_reason, salon_notes } = req.body;

      const booking = await Booking.findByPk(bookingId);
      if (!booking) throw ApiError.notFound('Booking not found');

      // Verify user is a salon member with appropriate role
      const member = await SalonMember.findOne({
        where: { salon_id: booking.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member) throw ApiError.forbidden('You are not authorized to update this booking');

      // Validate status transitions
      const validTransitions: Record<string, string[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['in_progress', 'cancelled', 'no_show'],
        in_progress: ['completed', 'no_show'],
      };

      if (!validTransitions[booking.status]?.includes(status)) {
        throw ApiError.badRequest(`Cannot change status from ${booking.status} to ${status}`);
      }

      const updateData: any = { status };
      if (status === 'cancelled') {
        // This endpoint is salon-side only (requires salon membership), so always 'salon'
        updateData.cancelled_by = 'salon';
        updateData.cancellation_reason = cancellation_reason;
      }
      if (salon_notes) updateData.salon_notes = salon_notes;

      await booking.update(updateData);

      // Send notification to customer
      const statusMessages: Record<string, string> = {
        confirmed: 'Your booking has been confirmed!',
        in_progress: 'Your service has started.',
        completed: 'Your service is complete.',
        cancelled: 'Your booking has been cancelled.',
        no_show: 'You were marked as no-show.',
      };

      await NotificationService.send({
        userId: booking.customer_id,
        title: `Booking ${status.replace('_', ' ')}`,
        body: statusMessages[status] || `Booking status updated to ${status}`,
        type: `booking_${status}` as any,
        data: { booking_id: booking.id },
      });

      // F.1 & F.2: On completion, send payment reminder (if unpaid) and review request
      if (status === 'completed') {
        const salon = await Salon.findByPk(booking.salon_id, { attributes: ['id', 'name'] });
        const salonName = salon?.name || 'the salon';

        // F.1: Payment reminder for unpaid bookings
        if (booking.payment_status === 'pending') {
          await NotificationService.send({
            userId: booking.customer_id,
            title: 'Service Complete — Pay Now',
            body: `Your service at ${salonName} is done! Please pay ₹${booking.total_amount}`,
            type: 'payment_reminder',
            data: { booking_id: booking.id, amount: booking.total_amount, salon_name: salonName },
          });
        }

        // F.2: Review request
        await NotificationService.send({
          userId: booking.customer_id,
          title: 'How was your experience?',
          body: `Rate your visit at ${salonName} and help others find great service`,
          type: 'review_request',
          data: { booking_id: booking.id, salon_id: booking.salon_id, salon_name: salonName, stylist_member_id: booking.stylist_member_id },
        });
      }

      ApiResponse.success(res, { message: 'Booking status updated', data: booking });
    } catch (error) {
      next(error);
    }
  }

  // Cancel booking (customer side)
  static async cancel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const booking = await Booking.findByPk(req.params.bookingId);
      if (!booking) throw ApiError.notFound('Booking not found');
      if (booking.customer_id !== req.user!.id) throw ApiError.forbidden('Access denied');

      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw ApiError.badRequest('Booking cannot be cancelled at this stage');
      }

      await booking.update({
        status: 'cancelled',
        cancelled_by: 'customer',
        cancellation_reason: req.body.reason || null,
      });

      // Notify salon
      await NotificationService.sendToSalonMembers({
        salonId: booking.salon_id,
        title: 'Booking Cancelled',
        body: `Booking #${booking.booking_number} has been cancelled by the customer`,
        type: 'booking_cancelled',
        data: { booking_id: booking.id },
        roles: ['owner', 'manager', 'receptionist'],
      });

      // Auto-trigger refund if paid online (within refund window)
      if (['online', 'token'].includes(booking.payment_mode) && ['paid', 'token_paid'].includes(booking.payment_status)) {
        try {
          const refundAmount = booking.payment_status === 'token_paid'
            ? parseFloat(booking.token_amount)
            : parseFloat(booking.total_amount);

          await RefundService.processRefund({
            bookingId: booking.id,
            amount: refundAmount,
            reason: `Booking cancelled by customer: ${req.body.reason || 'No reason provided'}`,
            initiatedBy: req.user!.id,
          });
        } catch (refundErr: any) {
          console.warn(`[Booking Cancel] Auto-refund failed for ${booking.id}:`, refundErr.message);
          // Don't block cancellation if refund fails — it can be done manually
        }
      }

      ApiResponse.success(res, { message: 'Booking cancelled', data: booking });
    } catch (error) {
      next(error);
    }
  }

  // Get salon bookings (salon side)
  static async getSalonBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { status, date, date_from, date_to, stylist_member_id, filter } = req.query;
      const { page, limit, offset } = parsePagination(req.query);

      const where: any = { salon_id: salonId };
      if (status) where.status = status;
      if (date) {
        where.booking_date = date;
      } else if (date_from || date_to) {
        where.booking_date = {};
        if (date_from) where.booking_date[Op.gte] = String(date_from);
        if (date_to) where.booking_date[Op.lte] = String(date_to);
      }
      if (stylist_member_id) where.stylist_member_id = stylist_member_id;

      // Handle upcoming/past filters
      const today = new Date().toISOString().split('T')[0];
      if (filter === 'upcoming') {
        where.booking_date = { [Op.gte]: today };
        where.status = { [Op.in]: ['awaiting_payment', 'pending', 'confirmed'] };
      } else if (filter === 'past') {
        where[Op.or] = [
          { booking_date: { [Op.lt]: today } },
          { status: { [Op.in]: ['completed', 'cancelled', 'no_show'] } },
        ];
      }

      const { rows, count } = await Booking.findAndCountAll({
        where,
        include: [
          { model: BookingService, as: 'services' },
          { model: User, as: 'customer', attributes: ['id', 'name', 'phone', 'profile_photo'] },
          {
            model: SalonMember, as: 'stylist',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }],
          },
        ],
        order: [['booking_date', 'ASC'], ['start_time', 'ASC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Collect payment at salon (salon side)
  static async collectPayment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const booking = await Booking.findByPk(req.params.bookingId);
      if (!booking) throw ApiError.notFound('Booking not found');

      // Verify salon member
      const member = await SalonMember.findOne({
        where: { salon_id: booking.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager', 'receptionist'].includes(member.role)) {
        throw ApiError.forbidden('Not authorized to collect payment');
      }

      if (booking.payment_status === 'paid') {
        throw ApiError.badRequest('Payment already collected');
      }

      await sequelize.transaction(async (t: any) => {
        // Create payment record
        await Payment.create({
          booking_id: booking.id,
          user_id: booking.customer_id,
          salon_id: booking.salon_id,
          amount: parseFloat(booking.total_amount),
          payment_type: 'full',
          status: 'captured',
          razorpay_order_id: `pay_at_salon_${Date.now()}`,
        }, { transaction: t });

        // Update booking payment status
        await booking.update({ payment_status: 'paid' }, { transaction: t });

        // Create earning record
        const commissionPercent = config.app.platformCommissionPercent;
        const totalAmount = parseFloat(booking.total_amount);
        const commissionAmount = (totalAmount * commissionPercent) / 100;
        const netAmount = totalAmount - commissionAmount;

        await SalonEarning.create({
          salon_id: booking.salon_id,
          booking_id: booking.id,
          total_amount: totalAmount,
          commission_percent: commissionPercent,
          commission_amount: commissionAmount,
          net_amount: netAmount,
        }, { transaction: t });
      });

      // H.2: Calculate breakdown for response
      const commissionPercent = config.app.platformCommissionPercent;
      const respTotalAmount = parseFloat(booking.total_amount);
      const respCommissionAmount = (respTotalAmount * commissionPercent) / 100;
      const respNetAmount = respTotalAmount - respCommissionAmount;

      // Notify customer
      await NotificationService.send({
        userId: booking.customer_id,
        title: 'Payment Received',
        body: `Payment of ₹${booking.total_amount} received for booking #${booking.booking_number}`,
        type: 'payment_received',
        data: { booking_id: booking.id },
      });

      ApiResponse.success(res, {
        message: 'Payment collected successfully',
        data: {
          total_amount: respTotalAmount,
          commission_amount: respCommissionAmount,
          net_amount: respNetAmount,
          commission_percent: commissionPercent,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Notify customer about upcoming booking (salon side)
  static async notifyCustomer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const booking = await Booking.findByPk(req.params.bookingId, {
        include: [{ model: Salon, as: 'salon', attributes: ['id', 'name'] }],
      });
      if (!booking) throw ApiError.notFound('Booking not found');

      // Verify salon member
      const member = await SalonMember.findOne({
        where: { salon_id: booking.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member) throw ApiError.forbidden('Not authorized');

      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw ApiError.badRequest('Can only notify for pending or confirmed bookings');
      }

      const salonName = booking.salon?.name || 'your salon';
      await NotificationService.send({
        userId: booking.customer_id,
        title: 'Appointment Reminder',
        body: `Reminder: Your appointment at ${salonName} is on ${booking.booking_date} at ${booking.start_time}`,
        type: 'booking_reminder',
        data: { booking_id: booking.id },
      });

      ApiResponse.success(res, { message: 'Customer notified successfully' });
    } catch (error) {
      next(error);
    }
  }
}
