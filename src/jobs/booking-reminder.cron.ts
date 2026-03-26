import cron from 'node-cron';
import { Op, literal } from 'sequelize';
import { Booking, Salon, Notification } from '../models';
import { NotificationService } from '../services/notification.service';

/**
 * Booking reminder cron — runs every 15 minutes.
 * Sends push notification to customer 1 hour before appointment.
 */
export function startBookingReminderCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const reminderWindowStart = currentMinutes + 45; // 45 min from now
      const reminderWindowEnd = currentMinutes + 75;   // 75 min from now

      const bookings = await Booking.findAll({
        where: {
          status: { [Op.in]: ['pending', 'confirmed'] },
          booking_date: today,
        },
        include: [
          { model: Salon, as: 'salon', attributes: ['id', 'name'] },
        ],
      });

      for (const booking of bookings) {
        const [hours, mins] = booking.start_time.split(':').map(Number);
        const bookingMinutes = hours * 60 + mins;

        if (bookingMinutes >= reminderWindowStart && bookingMinutes <= reminderWindowEnd) {
          // Check if reminder already sent
          const existing = await Notification.findOne({
            where: {
              user_id: booking.customer_id,
              type: 'booking_reminder',
              data: { booking_id: booking.id },
            },
          });

          if (!existing) {
            await NotificationService.send({
              userId: booking.customer_id,
              title: 'Appointment in 1 hour',
              body: `Your appointment at ${booking.salon?.name || 'the salon'} is at ${booking.start_time}. See you soon!`,
              type: 'booking_reminder',
              data: { booking_id: booking.id, salon_name: booking.salon?.name },
            });
          }
        }
      }
    } catch (error) {
      console.error('[Booking Reminder Cron] Error:', error);
    }
  });

  console.log('[Booking Reminder Cron] Scheduled: every 15 minutes');
}
