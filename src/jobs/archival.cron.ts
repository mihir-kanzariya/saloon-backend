import cron from 'node-cron';
import { Op } from 'sequelize';
import { WebhookEvent } from '../models';

/**
 * Archival cron — cleans up old processed records to prevent database bloat.
 * Runs every Sunday at 4 AM.
 */
export function startArchivalCron(): void {
  cron.schedule('0 4 * * 0', async () => {
    console.log(`[Archival Cron] Starting cleanup at ${new Date().toISOString()}`);

    try {
      // Delete processed webhook events older than 90 days
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const deletedWebhooks = await WebhookEvent.destroy({
        where: {
          status: 'processed',
          created_at: { [Op.lt]: ninetyDaysAgo },
        },
      });

      // Delete failed webhook events older than 30 days (already exhausted retries)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deletedFailed = await WebhookEvent.destroy({
        where: {
          status: 'failed',
          retry_count: { [Op.gte]: 5 },
          created_at: { [Op.lt]: thirtyDaysAgo },
        },
      });

      console.log(`[Archival Cron] Deleted ${deletedWebhooks} processed + ${deletedFailed} failed webhook events`);
    } catch (error) {
      console.error('[Archival Cron] Error:', error);
    }
  });

  console.log('[Archival Cron] Scheduled: every Sunday at 4 AM');
}
