import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendOtpValidation, verifyOtpValidation } from '../validators/auth.validator';

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: 'error', message: 'Too many OTP requests. Please try again later.' },
  keyGenerator: (req) => req.body?.phone || 'unknown',
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: 'error', message: 'Too many OTP verification attempts. Please try again later.' },
});

router.post('/send-otp', otpLimiter, validate(sendOtpValidation), AuthController.sendOtp);
router.post('/verify-otp', verifyOtpLimiter, validate(verifyOtpValidation), AuthController.verifyOtp);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', authenticate, AuthController.logout);

export default router;
