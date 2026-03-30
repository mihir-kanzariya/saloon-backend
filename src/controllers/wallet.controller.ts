import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';
import { generateTxId } from '../utils/id-generator';
import { auditLog } from '../utils/audit-logger';
import { WalletService } from '../services/wallet.service';
import Wallet from '../models/Wallet';
import WalletLedger from '../models/WalletLedger';
import Withdrawal from '../models/Withdrawal';
import LinkedAccount from '../models/LinkedAccount';
import config from '../config';

export class WalletController {
  /**
   * GET /wallet/salon/:salonId/summary
   * Get wallet balance summary
   */
  static async getSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const summary = await WalletService.getWalletSummary(salonId);

      // Get pending withdrawal total
      const pendingWithdrawals = await Withdrawal.sum('amount', {
        where: { salon_id: salonId, status: { [Op.in]: ['pending', 'processing'] } },
      }) || 0;

      ApiResponse.success(res, {
        data: {
          ...summary,
          pending_withdrawals: pendingWithdrawals,
          withdrawable_balance: Math.max(0, summary.available_balance - pendingWithdrawals),
          min_withdrawal: config.app.minWithdrawalAmount,
        },
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /wallet/salon/:salonId/ledger
   * Get transaction ledger (all credits and debits)
   */
  static async getLedger(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { page, limit } = parsePagination(req.query);
      const type = (req.query.type as string) || undefined;

      const where: any = { salon_id: salonId };
      if (type) where.type = type;

      const { rows, count } = await WalletLedger.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) { next(error); }
  }

  /**
   * POST /wallet/salon/:salonId/withdraw
   * Request a withdrawal using saved bank account
   */
  static async requestWithdrawal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { amount } = req.body;

      if (!amount || amount < config.app.minWithdrawalAmount) {
        throw ApiError.badRequest(`Minimum withdrawal is ₹${config.app.minWithdrawalAmount}`);
      }

      // Verify bank account exists
      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });
      if (!linkedAccount || !linkedAccount.bank_account_number) {
        throw ApiError.badRequest('Please set up your bank account before requesting a withdrawal');
      }

      const withdrawal = await sequelize.transaction(async (t) => {
        // Debit wallet (checks balance inside)
        await WalletService.debitWithdrawal({
          salonId,
          amount,
          withdrawalId: 'pending', // will update after creation
          transaction: t,
        });

        // Create withdrawal record with saved bank details
        const w = await Withdrawal.create({
          tx_id: generateTxId('WDR'),
          salon_id: salonId,
          requested_by: req.user!.id,
          amount,
          bank_details: {
            account_number: linkedAccount.bank_account_number,
            ifsc_code: linkedAccount.bank_ifsc,
            account_holder_name: linkedAccount.bank_beneficiary_name,
            bank_name: linkedAccount.bank_name || '',
          },
          status: 'pending',
        }, { transaction: t });

        return w;
      });

      auditLog('withdrawal.requested', {
        salon_id: salonId,
        amount,
        withdrawal_id: withdrawal.id,
        tx_id: withdrawal.tx_id,
      });

      ApiResponse.created(res, {
        data: withdrawal,
        message: 'Withdrawal request submitted. Processing within 2-3 business days.',
      });
    } catch (error) { next(error); }
  }

  /**
   * GET /wallet/salon/:salonId/withdrawals
   * Get withdrawal history
   */
  static async getWithdrawals(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salonId = req.params.salonId as string;
      const { page, limit } = parsePagination(req.query);

      const { rows, count } = await Withdrawal.findAndCountAll({
        where: { salon_id: salonId },
        order: [['created_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) { next(error); }
  }
}
