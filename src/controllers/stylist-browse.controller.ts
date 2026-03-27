import { Request, Response, NextFunction } from 'express';
import { Op, literal } from 'sequelize';
import { ApiResponse } from '../utils/apiResponse';
import { parsePagination } from '../utils/helpers';
import SalonMember from '../models/SalonMember';
import Salon from '../models/Salon';
import User from '../models/User';

export class StylistBrowseController {
  /**
   * GET /stylists/nearby
   * Browse stylists near a location. Joins SalonMember + Salon + User.
   */
  static async getNearby(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lat = parseFloat(req.query.latitude as string) || 23.0225;
      const lng = parseFloat(req.query.longitude as string) || 72.5714;
      const rad = parseFloat(req.query.radius as string) || 10;
      const search = req.query.search as string || '';
      const gender = req.query.gender as string || '';
      const { page, limit, offset } = parsePagination(req.query);

      const distanceFormula = `(6371 * acos(cos(radians(${lat})) * cos(radians("salon"."latitude")) * cos(radians("salon"."longitude") - radians(${lng})) + sin(radians(${lat})) * sin(radians("salon"."latitude"))))`;

      const salonWhere: any = { is_active: true };
      if (gender && gender !== 'all') salonWhere.gender_type = gender;

      const userWhere: any = {};
      if (search) {
        userWhere.name = { [Op.iLike]: `%${search}%` };
      }

      const { rows, count } = await SalonMember.findAndCountAll({
        where: { role: 'stylist', is_active: true },
        include: [
          {
            model: Salon,
            as: 'salon',
            where: salonWhere,
            attributes: ['id', 'name', 'address', 'city', 'latitude', 'longitude', 'gender_type', 'cover_image',
              [literal(distanceFormula), 'distance']
            ],
          },
          {
            model: User,
            as: 'user',
            where: Object.keys(userWhere).length > 0 ? userWhere : undefined,
            attributes: ['id', 'name', 'profile_photo', 'gender'],
          },
        ],
        attributes: ['id', 'role', 'specializations', 'commission_percentage'],
        order: [[literal(distanceFormula), 'ASC']],
        limit,
        offset,
        subQuery: false,
      });

      // Filter by distance (can't use HAVING with findAndCountAll easily)
      const filtered = rows.filter((r: any) => {
        const dist = parseFloat(r.salon?.dataValues?.distance || '999');
        return dist <= rad;
      });

      ApiResponse.paginated(res, { data: filtered, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }
}
