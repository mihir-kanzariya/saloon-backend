import { Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { parsePagination } from '../utils/helpers';

import Notification from '../models/Notification';

export class NotificationController {
  static async getAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit, offset } = parsePagination(req.query);

      const { rows, count } = await Notification.findAndCountAll({
        where: { user_id: req.user!.id },
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });

      ApiResponse.paginated(res, { data: rows, page, limit, total: count });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notificationId } = req.params;
      await Notification.update({ is_read: true }, { where: { id: notificationId, user_id: req.user!.id } });
      ApiResponse.success(res, { message: 'Marked as read' });
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await Notification.update({ is_read: true }, { where: { user_id: req.user!.id, is_read: false } });
      ApiResponse.success(res, { message: 'All marked as read' });
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await Notification.count({ where: { user_id: req.user!.id, is_read: false } });
      ApiResponse.success(res, { data: { unread_count: count } });
    } catch (error) {
      next(error);
    }
  }
}
