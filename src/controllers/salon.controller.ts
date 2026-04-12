import { Response, NextFunction } from 'express';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination, calculateDistance } from '../utils/helpers';

import Salon from '../models/Salon';
import SalonMember from '../models/SalonMember';
import Service from '../models/Service';
import User from '../models/User';
import Review from '../models/Review';
import FavoriteSalon from '../models/FavoriteSalon';
import Booking from '../models/Booking';
import LinkedAccount from '../models/LinkedAccount';

export class SalonController {
  // Create salon
  static async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, phone, email, address, city, state, pincode, latitude, longitude, gender_type, cover_image, gallery, amenities, operating_hours, booking_settings } = req.body;
      const salon = await sequelize.transaction(async (t: any) => {
        const newSalon = await Salon.create({
          name, description, phone, email, address, city, state, pincode, latitude, longitude, gender_type, cover_image, gallery, amenities, operating_hours, booking_settings,
          owner_id: req.user!.id,
        }, { transaction: t });

        // Update user role to salon_user
        await User.update({ role: 'salon_user' }, { where: { id: req.user!.id }, transaction: t });

        // Add owner as salon member
        await SalonMember.create({
          salon_id: newSalon.id,
          user_id: req.user!.id,
          role: 'owner',
        }, { transaction: t });

        return newSalon;
      });

      ApiResponse.created(res, { data: salon, message: 'Salon created successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Get salon by ID
  static async getById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      const extraAttributes: any[] = [];
      const replacements: any = {};

      if (userId) {
        extraAttributes.push(
          [sequelize.literal(`(SELECT COUNT(*) > 0 FROM favorite_salons WHERE favorite_salons.salon_id = "Salon".id AND favorite_salons.user_id = :userId)`), 'is_favorited']
        );
        replacements.userId = userId;
      }

      const salon = await Salon.findByPk(req.params.salonId, {
        attributes: {
          include: extraAttributes,
        },
        include: [
          { model: User, as: 'owner', attributes: ['id', 'name', 'phone', 'profile_photo'] },
          { model: Service, as: 'services', where: { is_active: true }, required: false },
          {
            model: SalonMember, as: 'members',
            where: { role: 'stylist', is_active: true },
            required: false,
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'profile_photo'] }],
          },
        ],
        replacements,
      } as any);

      if (!salon) throw ApiError.notFound('Salon not found');
      ApiResponse.success(res, { data: salon });
    } catch (error) {
      next(error);
    }
  }

  // Get nearby salons
  static async getNearby(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { lat, lng, radius = 10, gender_type, search, sort } = req.query;
      const { page, limit, offset } = parsePagination(req.query);

      if (!lat || !lng) throw ApiError.badRequest('Latitude and longitude are required');

      const userLat = parseFloat(lat as string);
      const userLng = parseFloat(lng as string);
      const maxRadius = parseFloat(radius as string);

      if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !Number.isFinite(maxRadius)) {
        throw ApiError.badRequest('Invalid coordinates or radius');
      }

      const where: any = { is_active: true };
      if (gender_type) where.gender_type = gender_type;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { address: { [Op.iLike]: `%${search}%` } },
          { city: { [Op.iLike]: `%${search}%` } },
          // Also match salons that have a service whose name matches
          sequelize.literal(`EXISTS (SELECT 1 FROM services WHERE services.salon_id = "Salon".id AND services.is_active = true AND services.name ILIKE :searchPattern)`),
        ];
      }

      // B.2: Use replacements to prevent SQL injection for lat/lng/radius
      const distanceFormula = `(6371 * acos(LEAST(1.0, cos(radians(:userLat)) * cos(radians("Salon".latitude)) * cos(radians("Salon".longitude) - radians(:userLng)) + sin(radians(:userLat)) * sin(radians("Salon".latitude)))))`;

      where[Op.and] = [
        ...(where[Op.and] || []),
        sequelize.literal(`${distanceFormula} <= :maxRadius`),
      ];

      const userId = req.user?.id;
      const extraAttributes: any[] = [
        [sequelize.literal(distanceFormula), 'distance'],
        [sequelize.literal(`(SELECT MIN(price) FROM services WHERE services.salon_id = "Salon".id AND services.is_active = true)`), 'min_price'],
        [sequelize.literal(`(SELECT MAX(price) FROM services WHERE services.salon_id = "Salon".id AND services.is_active = true)`), 'max_price'],
        [sequelize.literal(`(SELECT COUNT(*) FROM salon_members WHERE salon_members.salon_id = "Salon".id AND salon_members.role = 'stylist' AND salon_members.is_active = true)`), 'stylist_count'],
      ];

      const replacements: any = { userLat, userLng, maxRadius };

      if (search) {
        replacements.searchPattern = `%${search}%`;
      }

      if (userId) {
        extraAttributes.push(
          [sequelize.literal(`(SELECT COUNT(*) > 0 FROM favorite_salons WHERE favorite_salons.salon_id = "Salon".id AND favorite_salons.user_id = :userId)`), 'is_favorited']
        );
        replacements.userId = userId;
      }

      const { rows, count } = await Salon.findAndCountAll({
        where,
        attributes: {
          include: extraAttributes,
        },
        order: (() => {
          switch (sort) {
            case 'rating':
              return [
                [sequelize.literal('rating_avg'), 'DESC'],
                [sequelize.literal('distance'), 'ASC'],
              ];
            case 'price_low':
              return [
                [sequelize.literal('min_price'), 'ASC'],
                [sequelize.literal('distance'), 'ASC'],
              ];
            case 'price_high':
              return [
                [sequelize.literal('max_price'), 'DESC'],
                [sequelize.literal('distance'), 'ASC'],
              ];
            default: // 'distance' or unspecified
              return [[sequelize.literal('distance'), 'ASC']];
          }
        })(),
        limit,
        offset,
        subQuery: false,
        replacements,
      } as any);

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Update salon
  static async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const salon = await Salon.findByPk(req.params.salonId);
      if (!salon) throw ApiError.notFound('Salon not found');

      // Verify requester is owner or manager of this salon
      const member = await SalonMember.findOne({
        where: { salon_id: salon.id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager'].includes(member.role)) {
        throw ApiError.forbidden('Only owners and managers can update the salon');
      }

      // Merge booking_settings instead of replacing
      const { name, description, phone, email, address, city, state, pincode, latitude, longitude, gender_type, cover_image, gallery, amenities, operating_hours, holidays, booking_settings } = req.body;
      const mergedBookingSettings = booking_settings ? { ...salon.booking_settings, ...booking_settings } : undefined;

      await salon.update({ name, description, phone, email, address, city, state, pincode, latitude, longitude, gender_type, cover_image, gallery, amenities, operating_hours, holidays, booking_settings: mergedBookingSettings });
      ApiResponse.success(res, { message: 'Salon updated', data: salon });
    } catch (error) {
      next(error);
    }
  }

  // Get salons owned/managed by current user
  static async getMySalons(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const memberships = await SalonMember.findAll({
        where: { user_id: req.user!.id, is_active: true },
        include: [{ model: Salon, as: 'salon' }],
      });

      const salons = memberships.map((m: any) => ({
        ...m.salon.toJSON(),
        my_role: m.role,
        my_member_id: m.id,
      }));

      ApiResponse.success(res, { data: salons });
    } catch (error) {
      next(error);
    }
  }

  // Toggle favorite (uses findOrCreate to prevent race conditions on double-tap)
  static async toggleFavorite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;

      // Verify salon exists
      const salon = await Salon.findByPk(salonId, { attributes: ['id'] });
      if (!salon) throw ApiError.notFound('Salon not found');

      const [existing, created] = await FavoriteSalon.findOrCreate({
        where: { user_id: req.user!.id, salon_id: salonId },
        defaults: { user_id: req.user!.id, salon_id: salonId },
      });

      if (!created) {
        await existing.destroy();
        ApiResponse.success(res, { message: 'Removed from favorites', data: { is_favorite: false } });
      } else {
        ApiResponse.success(res, { message: 'Added to favorites', data: { is_favorite: true } });
      }
    } catch (error) {
      next(error);
    }
  }

  // Get favorites
  static async getFavorites(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await FavoriteSalon.findAndCountAll({
        where: { user_id: req.user!.id },
        include: [{ model: Salon, as: 'salon' }],
        limit,
        offset,
        order: [['created_at', 'DESC']],
      });
      const salons = rows.map((f: any) => f.salon);
      ApiResponse.paginated(res, { data: salons, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Remove favorite (idempotent — no error if already removed)
  static async removeFavorite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      await FavoriteSalon.destroy({ where: { user_id: req.user!.id, salon_id: salonId } });
      ApiResponse.success(res, { message: 'Removed from favorites' });
    } catch (error) {
      next(error);
    }
  }

  // Invite member
  static async inviteMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { phone, role } = req.body;

      if (!['manager', 'receptionist', 'stylist'].includes(role)) {
        throw ApiError.badRequest('Invalid role');
      }

      let user = await User.findOne({ where: { phone } });
      if (!user) {
        user = await User.create({ phone, role: 'salon_user' });
      }

      const existingMember = await SalonMember.findOne({
        where: { salon_id: salonId, user_id: user.id },
      });

      if (existingMember) {
        if (existingMember.is_active) throw ApiError.conflict('User is already a member');
        await existingMember.update({ role, is_active: true, invited_by: req.user!.id, invitation_status: 'pending' });
        ApiResponse.success(res, { message: 'Member re-invited', data: existingMember });
        return;
      }

      const member = await SalonMember.create({
        salon_id: salonId,
        user_id: user.id,
        role,
        invited_by: req.user!.id,
        invitation_status: 'pending',
      });

      ApiResponse.created(res, { data: member, message: 'Invitation sent' });
    } catch (error) {
      next(error);
    }
  }

  // C.5: Get salon members with pagination
  static async getMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await SalonMember.findAndCountAll({
        where: { salon_id: req.params.salonId, is_active: true },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone', 'profile_photo', 'gender'] }],
        limit,
        offset,
      });
      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  // Dashboard stats
  static async getStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { stylist_member_id } = req.query;
      const today = new Date().toISOString().split('T')[0];

      const bookingWhere: any = { salon_id: salonId };
      if (stylist_member_id) bookingWhere.stylist_member_id = stylist_member_id;

      const [todayBookings, todayRevenue, pendingBookings, salon] = await Promise.all([
        Booking.count({
          where: { ...bookingWhere, booking_date: today },
        }),
        Booking.sum('total_amount', {
          where: {
            ...bookingWhere,
            booking_date: today,
            status: { [Op.in]: ['confirmed', 'in_progress', 'completed'] },
          },
        }),
        Booking.count({
          where: { ...bookingWhere, status: 'pending' },
        }),
        Salon.findByPk(salonId, { attributes: ['rating_avg', 'rating_count'] }),
      ]);

      ApiResponse.success(res, {
        data: {
          today_bookings: todayBookings || 0,
          today_revenue: todayRevenue || 0,
          pending_bookings: pendingBookings || 0,
          rating_avg: salon?.rating_avg || 0,
          rating_count: salon?.rating_count || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search user by phone (for adding to team)
  static async searchMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone } = req.body;
      if (!phone) throw ApiError.badRequest('Phone number is required');

      const user = await User.findOne({
        where: { phone },
        attributes: ['id', 'name', 'phone', 'profile_photo', 'gender'],
      });

      if (!user) throw ApiError.notFound('No user found with this phone number');

      // Check if already a member of this salon
      const existingMember = await SalonMember.findOne({
        where: { salon_id: req.params.salonId, user_id: user.id, is_active: true },
      });

      if (existingMember) throw ApiError.conflict('This user is already a member of your salon');

      ApiResponse.success(res, { data: user });
    } catch (error) {
      next(error);
    }
  }

  // Remove member
  static async removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId, memberId } = req.params;
      const member = await SalonMember.findOne({ where: { id: memberId, salon_id: salonId } });
      if (!member) throw ApiError.notFound('Member not found');
      if (member.role === 'owner') throw ApiError.forbidden('Cannot remove the owner');

      await member.update({ is_active: false });
      ApiResponse.success(res, { message: 'Member removed' });
    } catch (error) {
      next(error);
    }
  }

  // Update bank account for salon
  static async updateBankAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const { holder_name, account_number, ifsc, bank_name } = req.body;

      if (!holder_name || !account_number || !ifsc) {
        throw ApiError.badRequest('holder_name, account_number, and ifsc are required');
      }

      // Validate IFSC format
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
        throw ApiError.badRequest('Invalid IFSC code format');
      }

      // Auto-fetch bank name if not provided
      let resolvedBankName = bank_name || null;
      if (!resolvedBankName) {
        try {
          const axios = require('axios');
          const resp = await axios.get(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
          resolvedBankName = resp.data.BANK || null;
        } catch (_) {
          // Silently ignore — bank_name remains null
        }
      }

      const salon = await Salon.findByPk(salonId);
      if (!salon) throw ApiError.notFound('Salon not found');

      const [linkedAccount, created] = await LinkedAccount.findOrCreate({
        where: { salon_id: salonId },
        defaults: {
          salon_id: salonId,
          legal_business_name: salon.name,
          contact_name: holder_name,
          contact_email: salon.email || 'noreply@example.com',
          contact_phone: salon.phone || '0000000000',
          bank_account_number: account_number,
          bank_ifsc: ifsc.toUpperCase(),
          bank_beneficiary_name: holder_name,
          bank_name: resolvedBankName,
        },
      });

      if (!created) {
        await linkedAccount.update({
          bank_account_number: account_number,
          bank_ifsc: ifsc.toUpperCase(),
          bank_beneficiary_name: holder_name,
          bank_name: resolvedBankName,
        });
      }

      const masked = account_number.length > 4
        ? '****' + account_number.slice(-4)
        : account_number;

      ApiResponse.success(res, {
        message: 'Bank account updated successfully',
        data: {
          holder_name: linkedAccount.bank_beneficiary_name,
          account_number_masked: masked,
          ifsc: linkedAccount.bank_ifsc,
          bank_name: linkedAccount.bank_name,
          bank_verified: linkedAccount.bank_verified,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get bank account for salon
  static async getBankAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;

      const linkedAccount = await LinkedAccount.findOne({ where: { salon_id: salonId } });

      if (!linkedAccount || !linkedAccount.bank_account_number) {
        ApiResponse.success(res, { data: null });
        return;
      }

      const accNum = linkedAccount.bank_account_number;
      const masked = accNum.length > 4
        ? '****' + accNum.slice(-4)
        : accNum;

      ApiResponse.success(res, {
        data: {
          holder_name: linkedAccount.bank_beneficiary_name,
          account_number: masked,
          account_number_masked: masked,
          ifsc: linkedAccount.bank_ifsc,
          bank_name: linkedAccount.bank_name,
          bank_verified: linkedAccount.bank_verified,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Search suggestions (services, salons, stylists)
  static async searchSuggestions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q, lat, lng } = req.query;
      if (!q || (q as string).length < 2) {
        ApiResponse.success(res, { data: { services: [], salons: [], stylists: [] } });
        return;
      }
      const query = `%${q}%`;

      // 1. Matching services (case-insensitive dedup, filter bad prices)
      const services = await sequelize.query(`
        SELECT INITCAP(LOWER(s.name)) as name, MIN(s.price) as min_price, COUNT(DISTINCT s.salon_id) as salon_count
        FROM services s
        JOIN salons sl ON sl.id = s.salon_id AND sl.is_active = true
        WHERE s.is_active = true AND s.name ILIKE :query AND s.price >= 50
        GROUP BY LOWER(s.name)
        ORDER BY salon_count DESC, min_price ASC
        LIMIT 6
      `, { replacements: { query }, type: QueryTypes.SELECT });

      // 2. Matching salons (top 5 by rating)
      const salons = await sequelize.query(`
        SELECT id, name, cover_image, rating_avg, rating_count, address, city
        FROM salons
        WHERE is_active = true AND (name ILIKE :query OR address ILIKE :query OR city ILIKE :query)
        ORDER BY rating_avg DESC
        LIMIT 5
      `, { replacements: { query }, type: QueryTypes.SELECT });

      // 3. Matching stylists (top 5)
      const stylists = await sequelize.query(`
        SELECT u.id, u.name, u.profile_photo, sm.salon_id, sl.name as salon_name
        FROM salon_members sm
        JOIN users u ON u.id = sm.user_id
        JOIN salons sl ON sl.id = sm.salon_id AND sl.is_active = true
        WHERE sm.role = 'stylist' AND sm.is_active = true AND u.name ILIKE :query
        LIMIT 5
      `, { replacements: { query }, type: QueryTypes.SELECT });

      ApiResponse.success(res, { data: { services, salons, stylists } });
    } catch (error) {
      next(error);
    }
  }

  // Trending searches and top rated salons
  static async getTrending(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Get most booked services in the last 7 days
      const trending = await sequelize.query(`
        SELECT s.name, COUNT(bs.id) as booking_count, MIN(s.price) as min_price
        FROM booking_services bs
        JOIN services s ON s.id = bs.service_id
        JOIN bookings b ON b.id = bs.booking_id
        WHERE b.created_at >= NOW() - INTERVAL '7 days'
          AND b.status IN ('pending', 'confirmed', 'completed', 'in_progress')
        GROUP BY s.name
        ORDER BY booking_count DESC
        LIMIT 8
      `, { type: QueryTypes.SELECT });

      // Get top rated salons nearby (if lat/lng provided)
      const { lat, lng } = req.query;
      let topRated: any[] = [];
      if (lat && lng && Number.isFinite(parseFloat(lat as string)) && Number.isFinite(parseFloat(lng as string))) {
        topRated = await sequelize.query(`
          SELECT id, name, cover_image, rating_avg, rating_count, address,
            (6371 * acos(LEAST(1.0, cos(radians(:lat)) * cos(radians(latitude)) * cos(radians(longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(latitude))))) as distance
          FROM salons
          WHERE is_active = true AND rating_avg > 0
          ORDER BY rating_avg DESC, rating_count DESC
          LIMIT 5
        `, { replacements: { lat: parseFloat(lat as string), lng: parseFloat(lng as string) }, type: QueryTypes.SELECT });
      }

      ApiResponse.success(res, { data: { trending, topRated } });
    } catch (error) {
      next(error);
    }
  }

  // Track search query for analytics
  static async trackSearch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, result_count } = req.body;
      if (!query || (query as string).length < 2) {
        ApiResponse.success(res, { message: 'ok' });
        return;
      }

      // Upsert into search_analytics table
      await sequelize.query(`
        INSERT INTO search_analytics (query, search_count, last_searched_at, result_count)
        VALUES (:query, 1, NOW(), :result_count)
        ON CONFLICT (query) DO UPDATE SET
          search_count = search_analytics.search_count + 1,
          last_searched_at = NOW(),
          result_count = :result_count
      `, { replacements: { query: (query as string).toLowerCase().trim(), result_count: result_count || 0 } });

      ApiResponse.success(res, { message: 'ok' });
    } catch (error) {
      // Don't fail the request for analytics
      console.error('[SearchAnalytics]', error);
      ApiResponse.success(res, { message: 'ok' });
    }
  }
}
