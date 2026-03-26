import { NotificationService } from '../services/notification.service';
import cron from 'node-cron';
import { Op } from 'sequelize';
import { Booking } from '../models';
import { auditLog } from '../utils/audit-logger';

/**
 * Payment expiry cron — runs every minute.
 * Cancels bookings stuck in 'awaiting_payment' past their hold expiry.
 * This releases the slot for other customers.
 */
export function startPaymentExpiryCron(): void {
  cron.schedule('* * * * *', async () => {
    try {
      const expired = await Booking.findAll({
        where: {
          status: 'awaiting_payment',
          payment_expires_at: { [Op.lt]: new Date() },
        },
      });

      if (expired.length === 0) return;

      for (const booking of expired) {
        await booking.update({
          status: 'cancelled',
          cancelled_by: null,
          cancellation_reason: 'Payment not completed within time limit',
        });

        auditLog('booking.payment_expired', {
          booking_id: booking.id,
          booking_number: booking.booking_number,
          salon_id: booking.salon_id,
          amount: booking.total_amount,
        });

        NotificationService.send({
          userId: booking.customer_id,
          title: 'Booking Slot Expired',
          body: 'Your payment window has expired. The slot has been released. Please book again.',
          type: 'booking_expired',
          data: { booking_id: booking.id },
        }).catch(() => {});
      }

      console.log(`[Payment Expiry] Cancelled ${expired.length} unpaid booking(s)`);
    } catch (error) {
      console.error('[Payment Expiry Cron] Error:', error);
    }
  });

  console.log('[Payment Expiry Cron] Scheduled: every 1 minute');
}
