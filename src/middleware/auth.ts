import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { ApiError } from '../utils/apiError';
import { AuthRequest } from '../types';

import User from '../models/User';
import SalonMember from '../models/SalonMember';

export const authenticate = async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token is required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret) as { id: string; phone: string; role: string };

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['otp', 'otp_expires_at'] },
    });

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    if (!user.is_active) {
      throw ApiError.forbidden('Account is deactivated');
    }

    req.user = user.toJSON();
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(error);
    }
    next(ApiError.unauthorized('Invalid or expired token'));
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
};

export const authorizeSalonMember = (...roles: string[]) => {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const salonId = req.params.salonId || req.body.salon_id;
      if (!salonId) {
        throw ApiError.badRequest('Salon ID is required');
      }

      const member = await SalonMember.findOne({
        where: {
          salon_id: salonId,
          user_id: req.user.id,
          is_active: true,
        },
      });

      if (!member) {
        throw ApiError.forbidden('You are not a member of this salon');
      }

      if (roles.length > 0 && !roles.includes(member.role)) {
        throw ApiError.forbidden('You do not have the required role for this action');
      }

      req.salonMember = member.toJSON();
      next();
    } catch (error) {
      next(error);
    }
  };
};
