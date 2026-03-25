import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';
import { sequelize } from '../config/database';

import Review from '../models/Review';
import Booking from '../models/Booking';
import Salon from '../models/Salon';
import User from '../models/User';
import SalonMember from '../models/SalonMember';

export class ReviewController {
  static async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { booking_id, salon_rating, stylist_rating, comment, photos } = req.body;

      const booking = await Booking.findByPk(booking_id);
      if (!booking) throw ApiError.notFound('Booking not found');
      if (booking.customer_id !== req.user!.id) throw ApiError.forbidden('You can only review your own bookings');
      if (booking.status !== 'completed') throw ApiError.badRequest('Can only review completed bookings');

      const existingReview = await Review.findOne({ where: { booking_id } });
      if (existingReview) throw ApiError.conflict('Review already exists for this booking');

      const review = await sequelize.transaction(async (t: any) => {
        const newReview = await Review.create({
          booking_id,
          customer_id: req.user!.id,
          salon_id: booking.salon_id,
          stylist_member_id: booking.stylist_member_id,
          salon_rating,
          stylist_rating: stylist_rating || null,
          comment: comment || null,
          photos: photos || [],
        }, { transaction: t });

        // Update salon average rating
        const avgResult = await Review.findOne({
          where: { salon_id: booking.salon_id, is_visible: true },
          attributes: [
            [sequelize.fn('AVG', sequelize.col('salon_rating')), 'avg_rating'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          ],
          transaction: t,
          raw: true,
        });

        await Salon.update({
          rating_avg: parseFloat(avgResult.avg_rating) || 0,
          rating_count: parseInt(avgResult.count, 10) || 0,
        }, { where: { id: booking.salon_id }, transaction: t });

        return newReview;
      });

      ApiResponse.created(res, { data: review, message: 'Review submitted' });
    } catch (error) {
      next(error);
    }
  }

  static async getSalonReviews(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { stylist_member_id } = req.query;
      const { page, limit, offset } = parsePagination(req.query);

      const where: any = { salon_id: salonId, is_visible: true };
      if (stylist_member_id) where.stylist_member_id = stylist_member_id;

      const { rows, count } = await Review.findAndCountAll({
        where,
        include: [
          { model: User, as: 'customer', attributes: ['id', 'name', 'profile_photo'] },
          {
            model: SalonMember, as: 'stylist',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }],
          },
        ],
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  static async reply(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const review = await Review.findByPk(req.params.reviewId);
      if (!review) throw ApiError.notFound('Review not found');

      // Verify user is a salon member with appropriate role
      const member = await SalonMember.findOne({
        where: { salon_id: review.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager'].includes(member.role)) {
        throw ApiError.forbidden('You are not authorized to reply to reviews for this salon');
      }

      await review.update({ reply: req.body.reply, replied_at: new Date() });
      ApiResponse.success(res, { message: 'Reply added', data: review });
    } catch (error) {
      next(error);
    }
  }
}
