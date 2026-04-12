import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AuthRequest } from '../types';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { OtpService } from '../services/otp.service';
import { TokenService } from '../services/token.service';
import { sanitizePhone } from '../utils/helpers';
import config from '../config';

import User from '../models/User';

export class AuthController {
  static async sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const phone = sanitizePhone(req.body.phone);
      if (!phone) throw ApiError.badRequest('Invalid phone number');

      let user = await User.findOne({ where: { phone } });
      if (!user) {
        user = await User.create({ phone });
      }

      if (!user.is_active) throw ApiError.forbidden('Account is deactivated');

      // Prevent OTP flooding: if OTP was sent recently and hasn't expired, reject
      if (user.otp_expires_at && new Date(user.otp_expires_at) > new Date()) {
        const remainingSec = Math.ceil((new Date(user.otp_expires_at).getTime() - Date.now()) / 1000);
        // Allow resend only if less than half the expiry time remains
        const halfExpiryMs = (config.app.otpExpiryMinutes * 60 * 1000) / 2;
        if (new Date(user.otp_expires_at).getTime() - Date.now() > halfExpiryMs) {
          throw ApiError.tooManyRequests(`OTP already sent. Please wait ${remainingSec} seconds before requesting again.`);
        }
      }

      const { otp, expiresAt } = await OtpService.sendOTP(phone);
      const hashedOtp = await bcrypt.hash(otp, 10);
      await user.update({ otp: hashedOtp, otp_expires_at: expiresAt });

      ApiResponse.success(res, {
        message: 'OTP sent successfully',
        data: {
          phone,
          otp_expiry_minutes: 5,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const phone = sanitizePhone(req.body.phone);
      const { otp } = req.body;
      if (!phone) throw ApiError.badRequest('Invalid phone number');
      if (!otp || typeof otp !== 'string' || otp.length < 4 || otp.length > 6) {
        throw ApiError.badRequest('Invalid OTP format');
      }

      const user = await User.findOne({ where: { phone } });
      if (!user) throw ApiError.notFound('User not found. Please request OTP first.');

      const result = await OtpService.verifyOTP(phone, otp, user.otp, user.otp_expires_at);
      if (!result.valid) throw ApiError.badRequest(result.message);

      await user.update({ otp: null, otp_expires_at: null, last_login_at: new Date() });

      const tokens = TokenService.generateTokens(user);
      const userData = user.toJSON();
      delete userData.otp;
      delete userData.otp_expires_at;

      ApiResponse.success(res, {
        message: 'Login successful',
        data: { user: userData, ...tokens, is_new_user: !user.is_profile_complete },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) throw ApiError.badRequest('Refresh token is required');

      const decoded = TokenService.verifyRefreshToken(refreshToken);
      const user = await User.findByPk(decoded.id);
      if (!user || !user.is_active) throw ApiError.unauthorized('Invalid refresh token');

      const tokens = TokenService.generateTokens(user);
      ApiResponse.success(res, { message: 'Token refreshed', data: tokens });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // Clear FCM token so user doesn't receive push notifications
      if (req.user) {
        await User.update({ fcm_token: null }, { where: { id: req.user.id } });
      }
      return ApiResponse.success(res, { message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}
