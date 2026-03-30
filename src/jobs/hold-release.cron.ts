import cron from 'node-cron';
import { WalletService } from '../services/wallet.service';

/**
 * Hold release cron — runs every hour.
 * Releases funds that have passed the 7-day hold period.
 */
export function startHoldReleaseCron(): void {
  cron.schedule('0 * * * *', async () => {
    try {
      const released = await WalletService.releaseHeldFunds();
      if (released > 0) {
        console.log(`[Hold Release] Released ${released} held entries`);
      }
    } catch (error) {
      console.error('[Hold Release Cron] Error:', error);
    }
  });

  console.log('[Hold Release Cron] Scheduled: every hour');
}
