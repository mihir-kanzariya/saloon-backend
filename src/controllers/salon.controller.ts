import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
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
      const { lat, lng, radius = 10, gender_type, search } = req.query;
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
        order: [[sequelize.literal('distance'), 'ASC']],
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

  // Toggle favorite
  static async toggleFavorite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const existing = await FavoriteSalon.findOne({
        where: { user_id: req.user!.id, salon_id: salonId },
      });

      if (existing) {
        await existing.destroy();
        ApiResponse.success(res, { message: 'Removed from favorites', data: { is_favorite: false } });
      } else {
        await FavoriteSalon.create({ user_id: req.user!.id, salon_id: salonId });
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

  // Remove favorite
  static async removeFavorite(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salonId } = req.params;
      const deleted = await FavoriteSalon.destroy({ where: { user_id: req.user!.id, salon_id: salonId } });
      if (!deleted) throw ApiError.notFound('Favorite not found');
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
}
