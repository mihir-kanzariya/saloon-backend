import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';

import SalonMember from '../models/SalonMember';
import StylistAvailability from '../models/StylistAvailability';
import StylistBreak from '../models/StylistBreak';
import StylistLeave from '../models/StylistLeave';
import StylistService from '../models/StylistService';
import Service from '../models/Service';
import User from '../models/User';
import Booking from '../models/Booking';
import Salon from '../models/Salon';

export class StylistController {
  // Verify that the requesting user is either the stylist themselves or an owner/manager of the same salon
  private static async verifyStylistAccess(member: any, userId: string): Promise<void> {
    // If the requesting user is the stylist themselves
    if (member.user_id === userId) return;

    // Check if the requesting user is an owner or manager of the same salon
    const requester = await SalonMember.findOne({
      where: { salon_id: member.salon_id, user_id: userId, is_active: true },
    });
    if (!requester || !['owner', 'manager'].includes(requester.role)) {
      throw ApiError.forbidden('Access denied');
    }
  }

  // Create a new salon member (stylist/manager/receptionist)
  static async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { salon_id, user_id, role, specializations, commission_percentage } = req.body;

      if (!salon_id || !user_id) throw ApiError.badRequest('salon_id and user_id are required');
      if (!['stylist', 'manager', 'receptionist'].includes(role)) {
        throw ApiError.badRequest('Invalid role');
      }

      // Verify salon exists
      const salon = await Salon.findByPk(salon_id);
      if (!salon) throw ApiError.notFound('Salon not found');

      // Verify requester is owner or manager
      const requester = await SalonMember.findOne({
        where: { salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!requester || !['owner', 'manager'].includes(requester.role)) {
        throw ApiError.forbidden('Only owners and managers can add team members');
      }

      // Check if already a member
      const existing = await SalonMember.findOne({
        where: { salon_id, user_id },
      });

      if (existing) {
        if (existing.is_active) throw ApiError.conflict('User is already a member of this salon');
        // Re-activate
        await existing.update({
          role,
          is_active: true,
          commission_percentage: commission_percentage || 0,
          specializations: specializations || [],
          invited_by: req.user!.id,
        });
        ApiResponse.success(res, { data: existing, message: 'Member re-activated' });
        return;
      }

      const member = await SalonMember.create({
        salon_id,
        user_id,
        role,
        invited_by: req.user!.id,
        invitation_status: 'accepted',
        commission_percentage: commission_percentage || 0,
        specializations: specializations || [],
      });

      // Assign specialization services if provided
      if (specializations && specializations.length > 0) {
        const serviceRecords = specializations.map((serviceId: string) => ({
          salon_member_id: member.id,
          service_id: serviceId,
        }));
        await StylistService.bulkCreate(serviceRecords);
      }

      // Update user role to salon_user if not already
      await User.update({ role: 'salon_user' }, { where: { id: user_id } });

      const fullMember = await SalonMember.findByPk(member.id, {
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone', 'profile_photo'] }],
      });

      ApiResponse.created(res, { data: fullMember, message: 'Team member added' });
    } catch (error) {
      next(error);
    }
  }

  // Update existing salon member
  static async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;
      const { role, specializations, commission_percentage, profile_photo } = req.body;

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      if (member.role === 'owner') throw ApiError.forbidden('Cannot update owner role');

      // Verify requester is owner/manager of the same salon
      const requester = await SalonMember.findOne({
        where: { salon_id: member.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!requester || !['owner', 'manager'].includes(requester.role)) {
        throw ApiError.forbidden('Only owners and managers can update team members');
      }

      const updateData: any = {};
      if (role && ['stylist', 'manager', 'receptionist'].includes(role)) updateData.role = role;
      if (commission_percentage !== undefined) updateData.commission_percentage = commission_percentage;
      if (specializations !== undefined) updateData.specializations = specializations;

      await member.update(updateData);

      // Update the associated user's profile photo if provided
      if (profile_photo !== undefined && member.user_id) {
        await User.update({ profile_photo }, { where: { id: member.user_id } });
      }

      // Update service assignments if specializations changed
      if (specializations) {
        await StylistService.destroy({ where: { salon_member_id: memberId } });
        if (specializations.length > 0) {
          const serviceRecords = specializations.map((serviceId: string) => ({
            salon_member_id: memberId,
            service_id: serviceId,
          }));
          await StylistService.bulkCreate(serviceRecords);
        }
      }

      const updatedMember = await SalonMember.findByPk(memberId, {
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'phone', 'profile_photo'] }],
      });

      ApiResponse.success(res, { message: 'Member updated', data: updatedMember });
    } catch (error) {
      next(error);
    }
  }

  // Get stylist profile with services and availability
  static async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const member = await SalonMember.findByPk(req.params.memberId, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'name', 'phone', 'profile_photo', 'gender'] },
          {
            model: StylistService, as: 'stylist_services',
            include: [{ model: Service, as: 'service' }],
          },
          { model: StylistAvailability, as: 'availability' },
          { model: StylistBreak, as: 'breaks' },
        ],
      });

      if (!member) throw ApiError.notFound('Stylist not found');
      ApiResponse.success(res, { data: member });
    } catch (error) {
      next(error);
    }
  }

  // Set availability
  static async setAvailability(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;
      const { availability } = req.body; // Array of { day_of_week, start_time, end_time, is_available }

      if (!Array.isArray(availability)) throw ApiError.badRequest('Availability must be an array');

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      const results = [];
      for (const slot of availability) {
        const [record] = await StylistAvailability.upsert({
          salon_member_id: memberId,
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_available: slot.is_available !== false,
        });
        results.push(record);
      }

      ApiResponse.success(res, { message: 'Availability updated', data: results });
    } catch (error) {
      next(error);
    }
  }

  // Get availability
  static async getAvailability(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const availability = await StylistAvailability.findAll({
        where: { salon_member_id: req.params.memberId },
        order: [['day_of_week', 'ASC']],
      });
      ApiResponse.success(res, { data: availability });
    } catch (error) {
      next(error);
    }
  }

  // Manage breaks
  static async addBreak(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      const { break_type, day_of_week, specific_date, start_time, end_time, label } = req.body;
      const brk = await StylistBreak.create({
        salon_member_id: memberId,
        break_type, day_of_week, specific_date, start_time, end_time, label,
      });
      ApiResponse.created(res, { data: brk, message: 'Break added' });
    } catch (error) {
      next(error);
    }
  }

  static async removeBreak(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const brk = await StylistBreak.findByPk(req.params.breakId);
      if (!brk) throw ApiError.notFound('Break not found');

      const member = await SalonMember.findByPk(brk.salon_member_id);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      await brk.destroy();
      ApiResponse.success(res, { message: 'Break removed' });
    } catch (error) {
      next(error);
    }
  }

  // Manage leaves
  static async addLeave(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      const { date, reason } = req.body;
      const leave = await StylistLeave.create({
        salon_member_id: memberId,
        date, reason,
      });
      ApiResponse.created(res, { data: leave, message: 'Leave added' });
    } catch (error) {
      next(error);
    }
  }

  static async removeLeave(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const leave = await StylistLeave.findByPk(req.params.leaveId);
      if (!leave) throw ApiError.notFound('Leave not found');

      const member = await SalonMember.findByPk(leave.salon_member_id);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      await leave.destroy();
      ApiResponse.success(res, { message: 'Leave removed' });
    } catch (error) {
      next(error);
    }
  }

  // Assign services to stylist
  static async assignServices(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;
      const { services } = req.body; // Array of { service_id, custom_price?, custom_duration_minutes? }

      if (!Array.isArray(services)) throw ApiError.badRequest('Services must be an array');

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      // Remove existing assignments
      await StylistService.destroy({ where: { salon_member_id: memberId } });

      // Create new ones
      const records = await StylistService.bulkCreate(
        services.map((s: any) => ({
          salon_member_id: memberId,
          service_id: s.service_id,
          custom_price: s.custom_price || null,
          custom_duration_minutes: s.custom_duration_minutes || null,
        }))
      );

      ApiResponse.success(res, { message: 'Services assigned', data: records });
    } catch (error) {
      next(error);
    }
  }

  // Update service timing (stylist self-service)
  static async updateServiceTiming(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId, serviceId } = req.params;
      const { custom_duration_minutes } = req.body;

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      const stylistService = await StylistService.findOne({
        where: { salon_member_id: memberId, service_id: serviceId },
      });
      if (!stylistService) throw ApiError.notFound('Service assignment not found');

      await stylistService.update({ custom_duration_minutes });

      ApiResponse.success(res, { message: 'Service timing updated', data: stylistService });
    } catch (error) {
      next(error);
    }
  }

  // Get stylist bookings
  static async getBookings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { memberId } = req.params;

      const member = await SalonMember.findByPk(memberId);
      if (!member) throw ApiError.notFound('Member not found');
      await StylistController.verifyStylistAccess(member, req.user!.id);

      const { status, date } = req.query;
      const { page, limit, offset } = parsePagination(req.query);
      const where: any = { stylist_member_id: memberId };
      if (status) where.status = status;
      if (date) where.booking_date = date;

      const { rows, count } = await Booking.findAndCountAll({
        where,
        include: [{ model: User, as: 'customer', attributes: ['id', 'name', 'phone', 'profile_photo'] }],
        order: [['booking_date', 'ASC'], ['start_time', 'ASC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }
}
