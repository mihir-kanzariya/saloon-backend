import { Transaction } from 'sequelize';
import { SalonEarning, Salon } from '../models';
import PricingService from '../services/pricing.service';
import { auditLog } from './audit-logger';

/**
 * Atomically create a SalonEarning record if one doesn't already exist for the booking.
 * Uses findOrCreate to prevent duplicate earnings from concurrent callers
 * (verifyPayment, webhook, auto-complete cron).
 */
export async function createEarningIfNotExists(params: {
  bookingId: string;
  salonId: string;
  totalAmount: number;
  transaction?: Transaction;
}): Promise<{ earning: any; created: boolean }> {
  const { bookingId, salonId, totalAmount, transaction } = params;

  const salon = await Salon.findByPk(salonId, {
    attributes: ['id', 'commission_override'],
    ...(transaction ? { transaction } : {}),
  });

  const commissionRate = PricingService.getCommissionRate(salon || {});
  const breakdown = PricingService.calculateEarningBreakdown(totalAmount, commissionRate);

  const [earning, created] = await SalonEarning.findOrCreate({
    where: { booking_id: bookingId },
    defaults: {
      salon_id: salonId,
      booking_id: bookingId,
      total_amount: breakdown.grossAmount,
      commission_percent: breakdown.commissionRate,
      commission_amount: breakdown.commissionAmount,
      net_amount: breakdown.netAmount,
      status: 'pending',
    },
    ...(transaction ? { transaction } : {}),
  });

  if (created) {
    auditLog('earning.created', {
      booking_id: bookingId,
      salon_id: salonId,
      total_amount: breakdown.grossAmount,
      commission: breakdown.commissionAmount,
      net: breakdown.netAmount,
    });
  }

  return { earning, created };
}
