import { Op, literal } from 'sequelize';
import { sequelize } from '../config/database';
import { Booking, SalonEarning, Salon, LinkedAccount, Transfer, SettlementBatch } from '../models';
import RazorpayService from './razorpay.service';
import PricingService from './pricing.service';
import { NotificationService } from './notification.service';
import config from '../config';
import { auditLog } from '../utils/audit-logger';
import { SalonSettlementData } from '../types';

interface SettlementResult {
  batchNumber: string;
  status: string;
  totalSalons: number;
  totalBookings: number;
  totalNetAmount: number;
  errors: Array<{ salonId: string; error: string }>;
}

class SettlementService {
  /**
   * Main entry point — called by weekly cron (Wednesday 2 AM).
   * Processes Mon-Sun of the previous week.
   */
  static async runWeeklySettlement(): Promise<SettlementResult> {
    const { periodStart, periodEnd } = SettlementService.calculatePeriod();
    const batchNumber = SettlementService.generateBatchNumber(periodEnd);

    // Check for duplicate batch
    const existingBatch = await SettlementBatch.findOne({ where: { batch_number: batchNumber } });
    if (existingBatch) {
      console.log(`[Settlement] Batch ${batchNumber} already exists, skipping.`);
      return {
        batchNumber,
        status: existingBatch.status,
        totalSalons: existingBatch.total_salons,
        totalBookings: existingBatch.total_bookings,
        totalNetAmount: parseFloat(existingBatch.total_net_amount),
        errors: existingBatch.error_log || [],
      };
    }

    // Create batch record
    const batch = await SettlementBatch.create({
      batch_number: batchNumber,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'processing',
    });

    const errors: Array<{ salonId: string; error: string }> = [];
    let totalSalons = 0;
    let totalBookings = 0;
    let totalGross = 0;
    let totalCommission = 0;
    let totalNet = 0;
    let totalRefundAdj = 0;

    try {
      // Gather eligible earnings grouped by salon
      const salonDataMap = await SettlementService.gatherEligibleEarnings();

      for (const [salonId, data] of salonDataMap.entries()) {
        try {
          await SettlementService.processOneSalon(data, batch.id);
          totalSalons++;
          totalBookings += data.earnings.length;
          // Gross is the sum of total_amount from earnings (before commission)
          totalGross += data.earnings.reduce((sum, e) => sum + e.netAmount, 0) + data.refundAdjustments;
          totalNet += data.finalTransferAmount;
          totalRefundAdj += data.refundAdjustments;
        } catch (err: any) {
          errors.push({ salonId, error: err.message || 'Unknown error' });
          console.error(`[Settlement] Salon ${salonId} failed:`, err.message);
        }
      }

      const finalStatus = errors.length === 0
        ? 'completed'
        : (totalSalons > 0 ? 'partially_failed' : 'failed');

      await batch.update({
        status: finalStatus,
        total_salons: totalSalons,
        total_bookings: totalBookings,
        total_gross_amount: totalGross,
        total_commission: totalCommission,
        total_net_amount: totalNet,
        total_refund_adjustments: totalRefundAdj,
        processed_at: new Date(),
        error_log: errors,
      });

      return { batchNumber, status: finalStatus, totalSalons, totalBookings, totalNetAmount: totalNet, errors };
    } catch (err: any) {
      await batch.update({ status: 'failed', error_log: [{ salonId: 'global', error: err.message }] });
      throw err;
    }
  }

  /**
   * Gather all eligible earnings, grouped by salon.
   */
  private static async gatherEligibleEarnings(): Promise<Map<string, SalonSettlementData>> {
    const bufferDate = new Date(Date.now() - config.app.settlementBufferHours * 60 * 60 * 1000);

    const earnings = await SalonEarning.findAll({
      where: {
        status: { [Op.in]: ['pending', 'ready_for_settlement'] },
      },
      include: [
        {
          model: Booking,
          as: 'booking',
          where: {
            status: 'completed',
            payment_status: 'paid',
            payment_mode: 'online',
            settlement_status: 'pending_settlement',
            updated_at: { [Op.lte]: bufferDate },
          },
          attributes: ['id', 'salon_id', 'booking_number'],
        },
        {
          model: Salon,
          as: 'salon',
          where: {
            kyc_status: 'verified',
            payout_enabled: true,
          },
          attributes: ['id', 'razorpay_account_id', 'commission_override'],
          include: [
            {
              model: LinkedAccount,
              as: 'linked_account',
              where: { status: 'activated' },
              attributes: ['id', 'razorpay_account_id'],
            },
          ],
        },
      ],
    });

    // Group by salon
    const salonMap = new Map<string, SalonSettlementData>();

    for (const earning of earnings) {
      const salonId = earning.booking.salon_id;
      const salon = earning.salon;
      const linkedAccount = salon.linked_account;

      if (!salonMap.has(salonId)) {
        salonMap.set(salonId, {
          salonId,
          linkedAccountId: linkedAccount.id,
          razorpayAccountId: linkedAccount.razorpay_account_id,
          earnings: [],
          refundAdjustments: 0,
          totalNetAmount: 0,
          finalTransferAmount: 0,
        });
      }

      const data = salonMap.get(salonId)!;
      const netAmount = parseFloat(earning.net_amount);
      const refundAdj = parseFloat(earning.refund_adjustment || 0);

      data.earnings.push({
        id: earning.id,
        bookingId: earning.booking.id,
        netAmount,
      });
      data.totalNetAmount += netAmount;
      data.refundAdjustments += refundAdj;
    }

    // Calculate final transfer amounts
    for (const data of salonMap.values()) {
      data.finalTransferAmount = PricingService.roundAmount(
        data.totalNetAmount - data.refundAdjustments
      );
    }

    return salonMap;
  }

  /**
   * Process settlement for a single salon — 3-step saga pattern.
   * Step 1: Create Transfer record (DB transaction)
   * Step 2: Call Razorpay API (outside transaction — with idempotency key)
   * Step 3: Update earnings/bookings to 'settled' (new DB transaction)
   * If step 2 fails → Transfer stays 'created', retry next week.
   * If step 3 fails → Transfer has razorpay_transfer_id, reconciliation catches it.
   */
  private static async processOneSalon(data: SalonSettlementData, batchId: string): Promise<void> {
    const rzp = RazorpayService.getInstance();
    const minAmount = config.app.minTransferAmount; // paise

    if (rzp.toPaise(data.finalTransferAmount) < minAmount) {
      console.log(`[Settlement] Salon ${data.salonId}: amount ₹${data.finalTransferAmount} below minimum, carrying forward.`);
      return;
    }

    const idempotencyKey = `settle_${batchId}_${data.salonId}`;
    const earningIds = data.earnings.map((e) => e.id);
    const bookingIds = data.earnings.map((e) => e.bookingId);

    // STEP 1: Create Transfer record with status='created' (inside transaction with advisory lock)
    const transfer = await sequelize.transaction(async (t) => {
      const lockKey = Math.abs(data.salonId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
      await sequelize.query(`SELECT pg_advisory_xact_lock(${lockKey})`, { transaction: t });

      // Check for existing transfer with same idempotency key (saga retry)
      const existing = await Transfer.findOne({ where: { idempotency_key: idempotencyKey }, transaction: t });
      if (existing && existing.razorpay_transfer_id) {
        return existing; // Step 2 already succeeded, skip to step 3
      }
      if (existing) {
        return existing; // Reuse the record for step 2
      }

      return Transfer.create({
        settlement_batch_id: batchId,
        salon_id: data.salonId,
        linked_account_id: data.linkedAccountId,
        amount: data.finalTransferAmount,
        status: 'created',
        source_type: 'direct',
        idempotency_key: idempotencyKey,
        metadata: {
          booking_ids: bookingIds,
          total_net: data.totalNetAmount,
          refund_adjustments: data.refundAdjustments,
          final_transfer: data.finalTransferAmount,
        },
      }, { transaction: t });
    });

    // STEP 2: Call Razorpay API (outside transaction — safe: idempotency key prevents double-transfer)
    if (!transfer.razorpay_transfer_id) {
      const rzpTransfer = await rzp.createDirectTransfer({
        account: data.razorpayAccountId,
        amount: rzp.toPaise(data.finalTransferAmount),
        currency: 'INR',
        notes: {
          batch_id: batchId,
          salon_id: data.salonId,
          booking_count: String(data.earnings.length),
        },
      });

      await transfer.update({
        razorpay_transfer_id: rzpTransfer.id,
        status: rzpTransfer.status || 'processed',
      });
    }

    // STEP 3: Update earnings/bookings to 'settled' (new transaction)
    await sequelize.transaction(async (t) => {
      await SalonEarning.update(
        { status: 'settled', settlement_batch_id: batchId, transfer_id: transfer.id },
        { where: { id: { [Op.in]: earningIds } }, transaction: t }
      );
      await Booking.update(
        { settlement_status: 'settled', settlement_batch_id: batchId, settled_at: new Date() },
        { where: { id: { [Op.in]: bookingIds } }, transaction: t }
      );
    });

    auditLog('settlement.transfer.completed', {
      salon_id: data.salonId,
      batch_id: batchId,
      transfer_id: transfer.id,
      amount: data.finalTransferAmount,
      bookings: bookingIds.length,
    });

    // Send settlement notification to salon owner (non-blocking)
    try {
      const salon = await Salon.findByPk(data.salonId, { attributes: ['owner_id', 'name'] });
      if (salon) {
        await NotificationService.send({
          userId: salon.owner_id,
          title: 'Weekly Payout Processed',
          body: `₹${data.finalTransferAmount} has been transferred to your bank for ${data.earnings.length} bookings.`,
          type: 'settlement',
          data: { salon_id: data.salonId, amount: String(data.finalTransferAmount) },
        });
      }
    } catch (notifErr) {
      console.warn('[Settlement] Failed to send notification:', notifErr);
    }
  }

  /**
   * Calculate the settlement period (previous week Mon-Sun).
   */
  private static calculatePeriod(): { periodStart: string; periodEnd: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - daysToLastSunday);
    lastSunday.setHours(0, 0, 0, 0);

    const lastMonday = new Date(lastSunday);
    lastMonday.setDate(lastSunday.getDate() - 6);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    return { periodStart: formatDate(lastMonday), periodEnd: formatDate(lastSunday) };
  }

  /**
   * Generate batch number from period end date.
   * Format: BATCH-YYYY-WNN
   */
  private static generateBatchNumber(periodEnd: string): string {
    const date = new Date(periodEnd);
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const daysSinceStart = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((daysSinceStart + startOfYear.getDay() + 1) / 7);
    return `BATCH-${year}-W${String(weekNumber).padStart(2, '0')}`;
  }

  /**
   * Get pending refund adjustments for a salon (used by RefundService).
   */
  static async getPendingRefundAdjustments(salonId: string): Promise<number> {
    const result = await SalonEarning.findOne({
      where: {
        salon_id: salonId,
        status: { [Op.in]: ['pending', 'ready_for_settlement'] },
        refund_adjustment: { [Op.gt]: 0 },
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('refund_adjustment')), 'total_adjustments'],
      ],
      raw: true,
    });
    return parseFloat((result as any)?.total_adjustments || '0');
  }
}

export default SettlementService;
