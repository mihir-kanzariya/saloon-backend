import app from './app';
import config from './config';
import { connectDB, sequelize } from './config/database';
import { startSettlementCron } from './jobs/settlement.cron';
import { startAutoCompleteCron } from './jobs/auto-complete.cron';
import { startIncentiveCron } from './jobs/incentive.cron';
import { startWebhookReplayCron } from './jobs/webhook-replay.cron';
import { startArchivalCron } from './jobs/archival.cron';
import { startPaymentExpiryCron } from './jobs/payment-expiry.cron';
import { startHoldReleaseCron } from './jobs/hold-release.cron';
import { startBookingReminderCron } from './jobs/booking-reminder.cron';
import { startDailySummaryCron } from './jobs/daily-summary.cron';

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDB();

    // Sync models (development only — use migrations in production)
    if (config.nodeEnv === 'development') {
      // Import models to register associations before sync
      require('./models');
      await sequelize.sync({ alter: true });
      console.log('Database models synced.');
    }

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
      console.log(`API: http://localhost:${config.port}${config.apiPrefix}`);
      console.log(`Health: http://localhost:${config.port}/health`);
    });

    // Start cron jobs (guarded by RUN_CRON env flag for multi-instance deployments)
    if (process.env.RUN_CRON !== 'false') {
      startSettlementCron();
      startAutoCompleteCron();
      startIncentiveCron();
      startWebhookReplayCron();
      startArchivalCron();
      startPaymentExpiryCron();
      startHoldReleaseCron();
      startBookingReminderCron();
      startDailySummaryCron();
    }

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await sequelize.close();
        console.log('Database connection closed.');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
