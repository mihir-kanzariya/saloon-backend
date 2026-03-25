import axios from 'axios';
import bcrypt from 'bcryptjs';
import config from '../config';
import { generateOTP } from '../utils/helpers';

export class OtpService {
  static async sendOTP(phone: string): Promise<{ otp: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + config.app.otpExpiryMinutes * 60 * 1000);

    // In development, use fixed OTP 1111 and skip MSG91
    if (config.nodeEnv === 'development') {
      return { otp: '1111', expiresAt };
    }

    const otp = generateOTP(6);

    try {
      await axios.post(
        'https://control.msg91.com/api/v5/otp',
        { template_id: config.msg91.templateId, mobile: `91${phone}`, otp },
        { headers: { authkey: config.msg91.authKey, 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      console.error('MSG91 OTP send error:', error.response?.data || error.message);
      throw new Error('Failed to send OTP. Please try again.');
    }

    return { otp, expiresAt };
  }

  static async verifyOTP(phone: string, otp: string, storedOtp: string | null, expiresAt: Date | null): Promise<{ valid: boolean; message: string }> {
    if (!storedOtp || !expiresAt || new Date() > new Date(expiresAt)) {
      return { valid: false, message: 'OTP has expired' };
    }

    const isMatch = await bcrypt.compare(otp, storedOtp);
    return {
      valid: isMatch,
      message: isMatch ? 'OTP verified' : 'Invalid OTP',
    };
  }
}
