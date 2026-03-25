import cron from 'node-cron';
import SettlementService from '../services/settlement.service';
import config from '../config';

export function startSettlementCron(): void {
  cron.schedule(config.app.settlementCronSchedule, async () => {
    console.log(`[Settlement Cron] Starting weekly settlement at ${new Date().toISOString()}`);
    try {
      const result = await SettlementService.runWeeklySettlement();
      console.log(`[Settlement Cron] Completed. Batch: ${result.batchNumber}, Status: ${result.status}`);
      console.log(`  Salons: ${result.totalSalons}, Net Amount: ₹${result.totalNetAmount}`);
      if (result.errors.length > 0) {
        console.error(`  Errors (${result.errors.length}):`, result.errors);
      }
    } catch (error) {
      console.error('[Settlement Cron] Fatal error:', error);
    }
  });

  console.log(`[Settlement Cron] Scheduled: ${config.app.settlementCronSchedule}`);
}
