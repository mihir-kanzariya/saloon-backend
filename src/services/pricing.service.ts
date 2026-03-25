import config from '../config';

export interface EarningBreakdown {
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  netAmount: number;
  refundAdjustment: number;
  finalTransferAmount: number;
}

class PricingService {
  /**
   * Get the commission rate for a salon.
   * Returns salon-specific override if set, otherwise the platform default (10%).
   */
  static getCommissionRate(salon: { commission_override?: number | null }): number {
    if (salon.commission_override != null && salon.commission_override >= 0) {
      return salon.commission_override;
    }
    return config.app.platformCommissionPercent;
  }

  /**
   * Calculate the earning breakdown for a booking/settlement.
   * @param totalAmount - Gross amount in INR
   * @param commissionRate - Commission percentage (e.g., 10 for 10%)
   * @param refundAdjustment - Amount to deduct for prior refunds (default 0)
   */
  static calculateEarningBreakdown(
    totalAmount: number,
    commissionRate: number,
    refundAdjustment: number = 0
  ): EarningBreakdown {
    const grossAmount = PricingService.roundAmount(totalAmount);
    const commissionAmount = PricingService.roundAmount((grossAmount * commissionRate) / 100);
    const netAmount = PricingService.roundAmount(grossAmount - commissionAmount);
    const finalTransferAmount = PricingService.roundAmount(netAmount - refundAdjustment);

    return {
      grossAmount,
      commissionRate,
      commissionAmount,
      netAmount,
      refundAdjustment,
      finalTransferAmount: Math.max(0, finalTransferAmount),
    };
  }

  /**
   * Round to 2 decimal places (standard currency rounding).
   */
  static roundAmount(amount: number): number {
    return Math.round(amount * 100) / 100;
  }
}

export default PricingService;
