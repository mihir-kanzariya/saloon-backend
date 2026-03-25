import cron from 'node-cron';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Booking, Salon, LinkedAccount, PayoutRequest } from '../models';
import config from '../config';

/**
 * Monthly incentive payout cron.
 * Runs on the 1st of every month at 3 AM.
 *
 * Per wiki: "Track monthly bookings. If ≥150 → ₹10,000 bonus.
 * Paid at end of month. Use Razorpay Payout API (not Route)."
 */
export function startIncentiveCron(): void {
  cron.schedule('0 3 1 * *', async () => {
    console.log(`[Incentive Cron] Starting monthly incentive check at ${new Date().toISOString()}`);

    try {
      const now = new Date();
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const periodStart = prevMonth.toISOString().split('T')[0];
      const periodEnd = prevMonthEnd.toISOString().split('T')[0];

      // Count completed bookings per salon for previous month
      const results: any[] = await Booking.findAll({
        where: {
          status: 'completed',
          booking_date: {
            [Op.between]: [periodStart, periodEnd],
          },
        },
        attributes: [
          'salon_id',
          [sequelize.fn('COUNT', sequelize.col('Booking.id')), 'booking_count'],
        ],
        group: ['salon_id'],
        having: sequelize.literal(`COUNT("Booking"."id") >= ${config.app.incentiveBookingThreshold}`),
        raw: true,
      });

      console.log(`[Incentive Cron] Found ${results.length} eligible salons for ${periodStart} to ${periodEnd}`);

      for (const row of results) {
        try {
          const salonId = row.salon_id;
          const bookingCount = parseInt(row.booking_count);

          // Check if incentive already created for this period
          const existingPayout = await PayoutRequest.findOne({
            where: {
              salon_id: salonId,
              type: 'incentive',
              idempotency_key: `incentive_${salonId}_${periodStart}_${periodEnd}`,
            },
          });

          if (existingPayout) {
            console.log(`[Incentive Cron] Salon ${salonId} already has incentive for this period`);
            continue;
          }

          // Verify salon has activated linked account
          const salon = await Salon.findByPk(salonId, {
            include: [{ model: LinkedAccount, as: 'linked_account' }],
          });

          if (!salon?.linked_account || salon.linked_account.status !== 'activated') {
            console.log(`[Incentive Cron] Salon ${salonId} skipped — no activated linked account`);
            continue;
          }

          // Create payout request record
          await PayoutRequest.create({
            salon_id: salonId,
            type: 'incentive',
            amount: config.app.incentiveAmount,
            description: `Monthly incentive for ${bookingCount} bookings (${periodStart} to ${periodEnd})`,
            initiated_by: salon.owner_id,
            idempotency_key: `incentive_${salonId}_${periodStart}_${periodEnd}`,
            status: 'pending',
            metadata: {
              period_start: periodStart,
              period_end: periodEnd,
              booking_count: bookingCount,
              threshold: config.app.incentiveBookingThreshold,
            },
          });

          console.log(`[Incentive Cron] Created incentive for salon ${salonId} (${bookingCount} bookings)`);

          // Note: Actual RazorpayX payout execution requires separate setup.
          // PayoutRequest records are created for admin review and manual/automated processing.
        } catch (err: any) {
          console.error(`[Incentive Cron] Error for salon ${row.salon_id}:`, err.message);
        }
      }

      console.log('[Incentive Cron] Completed');
    } catch (error) {
      console.error('[Incentive Cron] Fatal error:', error);
    }
  });

  console.log('[Incentive Cron] Scheduled: 1st of every month at 3 AM');
}
