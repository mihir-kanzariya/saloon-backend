import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types';
import { SettlementBatch, Transfer, Salon, LinkedAccount, Booking, SalonEarning, PayoutRequest } from '../models';
import SettlementService from '../services/settlement.service';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';

export class AdminController {
  /**
   * POST /admin/settlement/run
   * Manually trigger a settlement run.
   */
  static async triggerSettlement(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await SettlementService.runWeeklySettlement();
      ApiResponse.success(res, {
        data: result,
        message: `Settlement batch ${result.batchNumber} ${result.status}`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/settlement/batches
   * List settlement batches with pagination.
   */
  static async getSettlementBatches(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, offset } = parsePagination(req.query);

      const { count, rows } = await SettlementBatch.findAndCountAll({
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, {
        data: rows,
        page,
        limit,
        total: count,
        message: 'Settlement batches retrieved',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/settlement/batches/:batchId
   * Get batch detail with per-salon breakdown.
   */
  static async getSettlementBatchDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batchId } = req.params;

      const batch = await SettlementBatch.findByPk(batchId, {
        include: [
          {
            model: Transfer,
            as: 'transfers',
            include: [
              { model: Salon, as: 'salon', attributes: ['id', 'name', 'phone'] },
            ],
          },
        ],
      });

      if (!batch) {
        throw ApiError.notFound('Settlement batch not found');
      }

      ApiResponse.success(res, { data: batch });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/payouts
   * Create a manual payout (incentive/bonus).
   */
  static async createPayout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salon_id, amount, type, description } = req.body;

      if (!salon_id || !amount || !type) {
        throw ApiError.badRequest('salon_id, amount, and type are required');
      }

      const salon = await Salon.findByPk(salon_id, {
        include: [{ model: LinkedAccount, as: 'linked_account' }],
      });

      if (!salon) {
        throw ApiError.notFound('Salon not found');
      }

      if (!salon.linked_account || salon.linked_account.status !== 'activated') {
        throw ApiError.badRequest('Salon does not have an activated linked account');
      }

      const idempotencyKey = `payout_${type}_${salon_id}_${Date.now()}`;

      const payout = await PayoutRequest.create({
        salon_id,
        type,
        amount,
        description: description || `${type} payout`,
        initiated_by: req.user!.id,
        idempotency_key: idempotencyKey,
        status: 'pending',
      });

      // Note: Actual RazorpayX payout execution would go here
      // For now, we just create the record. RazorpayX integration requires
      // separate activation and fund account setup.

      ApiResponse.created(res, {
        data: payout,
        message: 'Payout request created',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/payouts
   * List payout requests with filters.
   */
  static async getPayouts(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const where: Record<string, any> = {};

      if (req.query.salon_id) where.salon_id = req.query.salon_id;
      if (req.query.status) where.status = req.query.status;
      if (req.query.type) where.type = req.query.type;

      const { count, rows } = await PayoutRequest.findAndCountAll({
        where,
        include: [{ model: Salon, as: 'salon', attributes: ['id', 'name'] }],
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/payouts/eligible
   * List salons eligible for monthly incentive.
   */
  static async getEligibleSalons(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Count completed bookings per salon this month
      const results = await Booking.findAll({
        where: {
          status: 'completed',
          booking_date: { [Op.gte]: startOfMonth.toISOString().split('T')[0] },
        },
        attributes: [
          'salon_id',
          [Booking.sequelize!.fn('COUNT', Booking.sequelize!.col('id')), 'booking_count'],
        ],
        group: ['salon_id'],
        having: Booking.sequelize!.literal(`COUNT(id) >= ${parseInt(String(req.query.threshold || config.app.incentiveBookingThreshold))}`),
        include: [{ model: Salon, as: 'salon', attributes: ['id', 'name', 'phone'] }],
        raw: false,
      });

      ApiResponse.success(res, {
        data: results,
        message: `Salons with ≥${config.app.incentiveBookingThreshold} completed bookings this month`,
      });
    } catch (error) {
      next(error);
    }
  }
}

// Import config at module level
import config from '../config';
