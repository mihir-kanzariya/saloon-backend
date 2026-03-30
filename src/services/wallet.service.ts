import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import Wallet from '../models/Wallet';
import WalletLedger from '../models/WalletLedger';
import { generateTxId } from '../utils/id-generator';
import { ApiError } from '../utils/apiError';
import { auditLog } from '../utils/audit-logger';
import config from '../config';

const HOLD_DAYS = 7;

export class WalletService {
  /**
   * Get or create a wallet for a salon
   */
  static async getOrCreateWallet(salonId: string, transaction?: Transaction): Promise<any> {
    const [wallet] = await Wallet.findOrCreate({
      where: { salon_id: salonId },
      defaults: { salon_id: salonId },
      ...(transaction ? { transaction } : {}),
    });
    return wallet;
  }

  /**
   * Credit earnings to wallet (called when payment is captured)
   * Funds are held for 7 days before becoming available
   */
  static async creditEarning(params: {
    salonId: string;
    amount: number;
    bookingId: string;
    description?: string;
    transaction?: Transaction;
  }): Promise<any> {
    const { salonId, amount, bookingId, description, transaction: t } = params;

    const exec = async (txn: Transaction) => {
      const wallet = await WalletService.getOrCreateWallet(salonId, txn);

      // Lock wallet row
      await Wallet.findOne({ where: { id: wallet.id }, lock: true, transaction: txn });

      const holdUntil = new Date(Date.now() + HOLD_DAYS * 24 * 60 * 60 * 1000);
      const newTotal = parseFloat(wallet.total_balance) + amount;
      const newHeld = parseFloat(wallet.held_balance) + amount;

      // Update wallet
      await wallet.update({
        total_balance: newTotal,
        held_balance: newHeld,
        total_earned: parseFloat(wallet.total_earned) + amount,
      }, { transaction: txn });

      // Create ledger entry
      const entry = await WalletLedger.create({
        tx_id: generateTxId('TXN'),
        wallet_id: wallet.id,
        salon_id: salonId,
        type: 'earning_credit',
        amount,
        direction: 'credit',
        balance_after: parseFloat(wallet.available_balance), // available doesn't change yet
        reference_type: 'booking',
        reference_id: bookingId,
        description: description || `Earning from booking`,
        hold_until: holdUntil,
        is_held: true,
      }, { transaction: txn });

      auditLog('wallet.earning_credit', { salon_id: salonId, amount, booking_id: bookingId, tx_id: entry.tx_id });
      return entry;
    };

    if (t) return exec(t);
    return sequelize.transaction(exec);
  }

  /**
   * Release held funds that have passed the 7-day hold period
   * Called by a cron job
   */
  static async releaseHeldFunds(): Promise<number> {
    const now = new Date();
    let released = 0;

    const heldEntries = await WalletLedger.findAll({
      where: {
        is_held: true,
        hold_until: { [Op.lte]: now },
      },
      limit: 500,
    });

    for (const entry of heldEntries) {
      try {
        await sequelize.transaction(async (t) => {
          const wallet = await Wallet.findOne({
            where: { salon_id: entry.salon_id },
            lock: true,
            transaction: t,
          });
          if (!wallet) return;

          const amount = parseFloat(entry.amount);
          await wallet.update({
            available_balance: parseFloat(wallet.available_balance) + amount,
            held_balance: Math.max(0, parseFloat(wallet.held_balance) - amount),
          }, { transaction: t });

          await entry.update({ is_held: false }, { transaction: t });

          // Create release ledger entry
          await WalletLedger.create({
            tx_id: generateTxId('TXN'),
            wallet_id: wallet.id,
            salon_id: entry.salon_id,
            type: 'hold_release',
            amount,
            direction: 'credit',
            balance_after: parseFloat(wallet.available_balance) + amount,
            reference_type: entry.reference_type,
            reference_id: entry.reference_id,
            description: 'Funds released after 7-day hold',
          }, { transaction: t });

          released++;
        });
      } catch (err: any) {
        console.error(`[WalletService] Failed to release entry ${entry.id}:`, err.message);
      }
    }

    if (released > 0) {
      auditLog('wallet.hold_release_batch', { released_count: released });
    }
    return released;
  }

  /**
   * Debit wallet for withdrawal
   */
  static async debitWithdrawal(params: {
    salonId: string;
    amount: number;
    withdrawalId: string;
    transaction: Transaction;
  }): Promise<any> {
    const { salonId, amount, withdrawalId, transaction: t } = params;

    const wallet = await Wallet.findOne({
      where: { salon_id: salonId },
      lock: true,
      transaction: t,
    });

    if (!wallet) throw ApiError.badRequest('Wallet not found');

    const available = parseFloat(wallet.available_balance);
    if (amount > available) {
      throw ApiError.badRequest(`Insufficient balance. Available: ₹${available.toFixed(2)}`);
    }

    const newAvailable = available - amount;
    const newTotal = parseFloat(wallet.total_balance) - amount;

    await wallet.update({
      available_balance: newAvailable,
      total_balance: newTotal,
      total_withdrawn: parseFloat(wallet.total_withdrawn) + amount,
    }, { transaction: t });

    const entry = await WalletLedger.create({
      tx_id: generateTxId('TXN'),
      wallet_id: wallet.id,
      salon_id: salonId,
      type: 'withdrawal_debit',
      amount,
      direction: 'debit',
      balance_after: newAvailable,
      reference_type: 'withdrawal',
      reference_id: withdrawalId,
      description: `Withdrawal request`,
    }, { transaction: t });

    auditLog('wallet.withdrawal_debit', { salon_id: salonId, amount, withdrawal_id: withdrawalId, tx_id: entry.tx_id });
    return entry;
  }

  /**
   * Debit wallet for refund (post-settlement)
   */
  static async debitRefund(params: {
    salonId: string;
    amount: number;
    bookingId: string;
    transaction?: Transaction;
  }): Promise<any> {
    const { salonId, amount, bookingId, transaction: t } = params;

    const exec = async (txn: Transaction) => {
      const wallet = await Wallet.findOne({
        where: { salon_id: salonId },
        lock: true,
        transaction: txn,
      });
      if (!wallet) return;

      // Debit from available first, then held
      let fromAvailable = Math.min(amount, parseFloat(wallet.available_balance));
      let fromHeld = amount - fromAvailable;

      await wallet.update({
        available_balance: parseFloat(wallet.available_balance) - fromAvailable,
        held_balance: Math.max(0, parseFloat(wallet.held_balance) - fromHeld),
        total_balance: parseFloat(wallet.total_balance) - amount,
      }, { transaction: txn });

      return WalletLedger.create({
        tx_id: generateTxId('TXN'),
        wallet_id: wallet.id,
        salon_id: salonId,
        type: 'refund_debit',
        amount,
        direction: 'debit',
        balance_after: parseFloat(wallet.available_balance) - fromAvailable,
        reference_type: 'booking',
        reference_id: bookingId,
        description: 'Refund adjustment',
      }, { transaction: txn });
    };

    if (t) return exec(t);
    return sequelize.transaction(exec);
  }

  /**
   * Get wallet summary for a salon
   */
  static async getWalletSummary(salonId: string): Promise<any> {
    const wallet = await WalletService.getOrCreateWallet(salonId);
    return {
      total_balance: parseFloat(wallet.total_balance),
      available_balance: parseFloat(wallet.available_balance),
      held_balance: parseFloat(wallet.held_balance),
      total_withdrawn: parseFloat(wallet.total_withdrawn),
      total_earned: parseFloat(wallet.total_earned),
      currency: wallet.currency,
      last_reconciled_at: wallet.last_reconciled_at,
    };
  }

  /**
   * Get ledger entries for a salon
   */
  static async getLedger(salonId: string, page: number = 1, limit: number = 20): Promise<any> {
    const offset = (page - 1) * limit;
    const { rows, count } = await WalletLedger.findAndCountAll({
      where: { salon_id: salonId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });
    return { entries: rows, total: count, page, limit };
  }
}
