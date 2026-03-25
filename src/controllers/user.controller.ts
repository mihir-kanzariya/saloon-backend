import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

import User from '../models/User';

export class UserController {
  static async getProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await User.findByPk(req.user!.id, {
        attributes: { exclude: ['otp', 'otp_expires_at'] },
      });
      ApiResponse.success(res, { data: user });
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, gender, profile_photo, saved_addresses } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (gender !== undefined) updateData.gender = gender;
      if (profile_photo !== undefined) updateData.profile_photo = profile_photo;
      if (saved_addresses !== undefined) updateData.saved_addresses = saved_addresses;

      if (name && !req.user!.is_profile_complete) {
        updateData.is_profile_complete = true;
      }

      await User.update(updateData, { where: { id: req.user!.id } });
      const updatedUser = await User.findByPk(req.user!.id, {
        attributes: { exclude: ['otp', 'otp_expires_at'] },
      });
      ApiResponse.success(res, { message: 'Profile updated', data: updatedUser });
    } catch (error) {
      next(error);
    }
  }

  static async updateFcmToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fcm_token } = req.body;
      if (!fcm_token) throw ApiError.badRequest('FCM token is required');
      await User.update({ fcm_token }, { where: { id: req.user!.id } });
      ApiResponse.success(res, { message: 'FCM token updated' });
    } catch (error) {
      next(error);
    }
  }

  static async deactivateAccount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await User.update({ is_active: false }, { where: { id: req.user!.id } });
      ApiResponse.success(res, { message: 'Account deactivated' });
    } catch (error) {
      next(error);
    }
  }
}
