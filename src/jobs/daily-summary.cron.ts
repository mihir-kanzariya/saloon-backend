import cron from 'node-cron';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Booking, Salon } from '../models';
import { NotificationService } from '../services/notification.service';

/**
 * Daily summary cron — runs at 9 PM IST (3:30 PM UTC).
 * Sends daily stats to salon owners: booking count + revenue.
 */
export function startDailySummaryCron(): void {
  cron.schedule('30 15 * * *', async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const salons = await Salon.findAll({
        where: { is_active: true },
        attributes: ['id', 'owner_id', 'name'],
      });

      for (const salon of salons) {
        try {
          const stats = await Booking.findOne({
            where: {
              salon_id: salon.id,
              booking_date: today,
              status: { [Op.in]: ['confirmed', 'in_progress', 'completed'] },
            },
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
              [sequelize.fn('SUM', sequelize.col('total_amount')), 'revenue'],
            ],
            raw: true,
          }) as any;

          const count = parseInt(stats?.count || '0');
          const revenue = parseFloat(stats?.revenue || '0');

          if (count === 0) continue; // Skip salons with no bookings

          await NotificationService.send({
            userId: salon.owner_id,
            title: "Today's Summary",
            body: `${salon.name}: ${count} booking${count > 1 ? 's' : ''}, \u20B9${revenue.toFixed(0)} revenue today.`,
            type: 'daily_summary',
            data: { salon_id: salon.id, bookings: String(count), revenue: String(revenue) },
          });
        } catch (err) {
          // Skip individual salon errors
        }
      }

      console.log(`[Daily Summary] Sent to active salons`);
    } catch (error) {
      console.error('[Daily Summary Cron] Error:', error);
    }
  });

  console.log('[Daily Summary Cron] Scheduled: 9 PM IST daily');
}
