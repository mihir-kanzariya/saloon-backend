import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';

import config from './config';
import { errorHandler } from './middleware/errorHandler';
import { ApiResponse } from './utils/apiResponse';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import salonRoutes from './routes/salon.routes';
import serviceRoutes from './routes/service.routes';
import stylistRoutes from './routes/stylist.routes';
import bookingRoutes from './routes/booking.routes';
import paymentRoutes from './routes/payment.routes';
import reviewRoutes from './routes/review.routes';
import chatRoutes from './routes/chat.routes';
import notificationRoutes from './routes/notification.routes';
import uploadRoutes from './routes/upload.routes';
import onboardingRoutes from './routes/onboarding.routes';
import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import utilsRoutes from './routes/utils.routes';
import promoRoutes from './routes/promo.routes';

const app = express();

// Trust proxy (needed for ngrok / reverse proxies so rate limiter reads correct client IP)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.corsOrigin || false,
  credentials: true,
}));

// Webhook rate limiter: 500 requests per minute per IP
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many webhook requests' },
});

// Webhook route — MUST be before express.json() to receive raw body for HMAC verification
app.use(`${config.apiPrefix}/webhooks`, webhookLimiter, webhookRoutes);

// Body parsing — preserve raw body for webhook signature verification fallback
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting — B.3: Tightened from 500 to 200 globally
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use(`${config.apiPrefix}/`, limiter);

// B.3: Per-endpoint rate limits
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many messages, please slow down' },
});

// Payment rate limiter: 20 attempts per 15 min per IP
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many payment attempts, please try again later' },
});

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '..', config.upload.dir)));

// Routes
app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/users`, userRoutes);
app.use(`${config.apiPrefix}/salons`, salonRoutes);
app.use(`${config.apiPrefix}/services`, serviceRoutes);
app.use(`${config.apiPrefix}/stylists`, stylistRoutes);
app.use(`${config.apiPrefix}/bookings`, bookingRoutes);
app.use(`${config.apiPrefix}/payments`, paymentLimiter, paymentRoutes);
app.use(`${config.apiPrefix}/reviews`, reviewRoutes);
app.use(`${config.apiPrefix}/chat`, chatLimiter, chatRoutes);
app.use(`${config.apiPrefix}/notifications`, notificationRoutes);
app.use(`${config.apiPrefix}/uploads`, uploadRoutes);
app.use(`${config.apiPrefix}/salons`, onboardingRoutes);
app.use(`${config.apiPrefix}/admin`, adminRoutes);
app.use(`${config.apiPrefix}/utils`, utilsRoutes);
app.use(`${config.apiPrefix}/promo-codes`, promoRoutes);

// Health check
app.get('/health', (_req, res) => {
  ApiResponse.success(res, { message: 'Server is running', data: { uptime: process.uptime() } });
});

// Public config endpoint — returns Supabase URL + anon key for Flutter client
app.get(`${config.apiPrefix}/config/public`, (_req, res) => {
  ApiResponse.success(res, {
    data: {
      supabase_url: config.supabase.url || '',
      supabase_anon_key: config.supabase.anonKey || '',
    },
  });

// App config endpoint — returns branding, limits, features for mobile clients
app.get(`${config.apiPrefix}/config/app`, (_req, res) => {
  ApiResponse.success(res, {
    data: {
      app_name: process.env.APP_NAME || 'HeloHair',
      tagline: process.env.APP_TAGLINE || 'Never wait at a salon again',
      logo_url: process.env.LOGO_URL || '',
      primary_color: process.env.PRIMARY_COLOR || '#1F6A63',
      currency: 'INR',
      max_booking_amount: config.app.maxBookingAmount || 100000,
      min_withdrawal: config.app.minWithdrawalAmount,
      commission_percent: config.app.platformCommissionPercent,
      payment_hold_minutes: config.app.paymentHoldMinutes || 10,
      support_email: process.env.SUPPORT_EMAIL || 'support@helohair.com',
      features: { promo_enabled: true, incentive_enabled: true },
    },
  });
});
});

// 404 handler
app.use((_req, res) => {
  ApiResponse.notFound(res, 'Route not found');
});

// Global error handler
app.use(errorHandler);

export default app;
