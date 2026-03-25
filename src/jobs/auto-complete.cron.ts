import cron from 'node-cron';
import { Op, literal } from 'sequelize';
import { Booking, SalonEarning, Salon } from '../models';
import PricingService from '../services/pricing.service';
import { NotificationService } from '../services/notification.service';

/**
 * Auto-complete bookings past their end time + 2 hours.
 * Runs every 30 minutes.
 *
 * Per wiki: "Auto-complete after time slot ends" — critical fraud control.
 * If salons alone control completion, they can fake bookings for incentives.
 */
export function startAutoCompleteCron(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
      const bufferMinutes = 120; // 2 hours buffer

      // Find bookings that should be auto-completed:
      // 1. booking_date is before today, OR
      // 2. booking_date is today AND end_time + 2hrs < current time
      const overdue = await Booking.findAll({
        where: {
          status: { [Op.in]: ['confirmed', 'in_progress'] },
          [Op.or]: [
            // Past dates
            { booking_date: { [Op.lt]: today } },
            // Today but end_time + buffer has passed
            {
              booking_date: today,
              [Op.and]: [
                literal(`(CAST(SPLIT_PART(end_time, ':', 1) AS INTEGER) * 60 + CAST(SPLIT_PART(end_time, ':', 2) AS INTEGER) + ${bufferMinutes}) <= ${currentTimeMinutes}`),
              ],
            },
          ],
        },
      });

      if (overdue.length === 0) return;

      console.log(`[Auto-Complete] Found ${overdue.length} overdue bookings`);

      for (const booking of overdue) {
        try {
          await booking.update({ status: 'completed' });

          // Create earning record if booking is online-paid and no earning exists
          if (booking.payment_status === 'paid' && booking.payment_mode === 'online') {
            const existingEarning = await SalonEarning.findOne({
              where: { booking_id: booking.id },
            });

            if (!existingEarning) {
              const salon = await Salon.findByPk(booking.salon_id);
              const commissionRate = PricingService.getCommissionRate(salon || {});
              const breakdown = PricingService.calculateEarningBreakdown(
                parseFloat(booking.total_amount),
                commissionRate
              );

              await SalonEarning.create({
                salon_id: booking.salon_id,
                booking_id: booking.id,
                total_amount: breakdown.grossAmount,
                commission_percent: breakdown.commissionRate,
                commission_amount: breakdown.commissionAmount,
                net_amount: breakdown.netAmount,
                status: 'pending',
              });
            }

            // Ensure settlement_status is set
            if (booking.settlement_status === 'not_applicable') {
              await booking.update({ settlement_status: 'pending_settlement' });
            }
          }

          // Notify salon about auto-completion
          try {
            await NotificationService.sendToSalonMembers({
              salonId: booking.salon_id,
              title: 'Booking Auto-Completed',
              body: `Booking #${booking.booking_number} has been auto-completed.`,
              type: 'booking_auto_complete',
              data: { booking_id: booking.id },
            });
          } catch (notifErr) {
            // Non-blocking
          }
        } catch (err: any) {
          console.error(`[Auto-Complete] Failed for booking ${booking.id}:`, err.message);
        }
      }

      console.log(`[Auto-Complete] Processed ${overdue.length} bookings`);
    } catch (error) {
      console.error('[Auto-Complete Cron] Error:', error);
    }
  });

  console.log('[Auto-Complete Cron] Scheduled: every 30 minutes');
}
