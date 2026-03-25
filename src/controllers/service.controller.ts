import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { parsePagination } from '../utils/helpers';

import Service from '../models/Service';
import ServiceCategory from '../models/ServiceCategory';
import SalonMember from '../models/SalonMember';

export class ServiceController {
  static async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Verify user is a salon member with appropriate role
      const member = await SalonMember.findOne({
        where: { salon_id: req.body.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager'].includes(member.role)) {
        throw ApiError.forbidden('You are not authorized to manage services for this salon');
      }

      const { name, category_id, price, duration_minutes, description, gender_type, is_active } = req.body;
      const service = await Service.create({
        salon_id: req.params.salonId ?? req.body.salon_id,
        name, category_id, price, duration_minutes, description, gender_type, is_active,
      });
      ApiResponse.created(res, { data: service, message: 'Service created' });
    } catch (error) {
      next(error);
    }
  }

  // C.5: Added pagination support
  static async getBySalon(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const where: any = { salon_id: req.params.salonId };

      // If `all` query param not passed, only show active services (for customer view)
      if (req.query.all !== 'true') {
        where.is_active = true;
      }

      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await Service.findAndCountAll({
        where,
        include: [{ model: ServiceCategory, as: 'category', attributes: ['id', 'name', 'icon'] }],
        order: [['display_order', 'ASC'], ['name', 'ASC']],
        limit,
        offset,
      });
      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const service = await Service.findByPk(req.params.serviceId);
      if (!service) throw ApiError.notFound('Service not found');

      // Verify user is a salon member with appropriate role
      const member = await SalonMember.findOne({
        where: { salon_id: service.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager'].includes(member.role)) {
        throw ApiError.forbidden('You are not authorized to manage services for this salon');
      }

      const { name, description, category_id, price, discounted_price, duration_minutes, gender, image, display_order, is_active } = req.body;
      await service.update({ name, description, category_id, price, discounted_price, duration_minutes, gender, image, display_order, is_active });
      ApiResponse.success(res, { message: 'Service updated', data: service });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const service = await Service.findByPk(req.params.serviceId);
      if (!service) throw ApiError.notFound('Service not found');

      // Verify user is a salon member with appropriate role
      const member = await SalonMember.findOne({
        where: { salon_id: service.salon_id, user_id: req.user!.id, is_active: true },
      });
      if (!member || !['owner', 'manager'].includes(member.role)) {
        throw ApiError.forbidden('You are not authorized to manage services for this salon');
      }

      await service.update({ is_active: false });
      ApiResponse.success(res, { message: 'Service deleted' });
    } catch (error) {
      next(error);
    }
  }

  static async getCategories(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await ServiceCategory.findAll({
        where: { is_active: true },
        order: [['display_order', 'ASC']],
      });
      ApiResponse.success(res, { data: categories });
    } catch (error) {
      next(error);
    }
  }
}
