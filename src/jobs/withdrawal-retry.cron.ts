import cron from 'node-cron';
import { Op } from 'sequelize';
import Withdrawal from '../models/Withdrawal';
import LinkedAccount from '../models/LinkedAccount';
import RazorpayService from '../services/razorpay.service';
import { auditLog } from '../utils/audit-logger';

/**
 * Withdrawal retry cron — runs every 30 minutes.
 * Retries pending withdrawals where the initial Razorpay transfer failed or was not attempted.
 * Only retries withdrawals that are at least 5 minutes old (avoid racing with the initial attempt).
 */
export function startWithdrawalRetryCron(): void {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const pendingWithdrawals = await Withdrawal.findAll({
        where: {
          status: 'pending',
          transaction_reference: null, // No Razorpay transfer ID — initial attempt failed
          created_at: { [Op.lte]: new Date(Date.now() - 5 * 60 * 1000) },
        },
        limit: 20,
        order: [['created_at', 'ASC']],
      });

      if (pendingWithdrawals.length === 0) return;

      console.log(`[Withdrawal Retry] Processing ${pendingWithdrawals.length} pending withdrawals`);

      const rzp = RazorpayService.getInstance();

      for (const withdrawal of pendingWithdrawals) {
        try {
          const linkedAccount = await LinkedAccount.findOne({
            where: { salon_id: withdrawal.salon_id },
          });

          if (!linkedAccount?.razorpay_account_id || linkedAccount.status !== 'activated') {
            console.warn(`[Withdrawal Retry] Skipping ${withdrawal.id} — linked account not activated`);
            continue;
          }

          const transfer = await rzp.createDirectTransfer({
            account: linkedAccount.razorpay_account_id,
            amount: rzp.toPaise(parseFloat(withdrawal.amount)),
            currency: 'INR',
            notes: {
              withdrawal_id: withdrawal.id,
              salon_id: withdrawal.salon_id,
              tx_id: withdrawal.tx_id,
            },
          });

          await withdrawal.update({
            status: 'processing',
            transaction_reference: transfer.id,
          });

          auditLog('withdrawal.retry_success', {
            withdrawal_id: withdrawal.id,
            razorpay_transfer_id: transfer.id,
          });

          console.log(`[Withdrawal Retry] ${withdrawal.id} → transfer ${transfer.id}`);
        } catch (err: any) {
          console.error(`[Withdrawal Retry] Failed for ${withdrawal.id}:`, err.message);
          auditLog('withdrawal.retry_failed', {
            withdrawal_id: withdrawal.id,
            error: err.message,
          });
        }
      }
    } catch (error) {
      console.error('[Withdrawal Retry Cron] Error:', error);
    }
  });

  console.log('[Withdrawal Retry Cron] Scheduled: every 30 minutes');
}
