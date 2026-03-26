import dotenv from 'dotenv';

dotenv.config();

const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET environment variable must be set'); })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || (() => { throw new Error('JWT_REFRESH_SECRET environment variable must be set'); })(),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // MSG91
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY || '',
    templateId: process.env.MSG91_TEMPLATE_ID || '',
    senderId: process.env.MSG91_SENDER_ID || 'SALOON',
  },

  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    accountNumber: process.env.RAZORPAY_ACCOUNT_NUMBER || '',
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  // Firebase
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  },

  // Upload
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10),
    dir: process.env.UPLOAD_DIR || 'uploads',
  },

  // App
  app: {
    otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10),
    bookingAdvanceDays: parseInt(process.env.BOOKING_ADVANCE_DAYS || '30', 10),
    platformCommissionPercent: parseFloat(process.env.PLATFORM_COMMISSION_PERCENT || '10'),
    minWithdrawalAmount: parseInt(process.env.MIN_WITHDRAWAL_AMOUNT || '500', 10),
    settlementCronSchedule: process.env.SETTLEMENT_CRON || '0 2 * * 3',
    settlementBufferHours: parseInt(process.env.SETTLEMENT_BUFFER_HOURS || '72', 10),
    minTransferAmount: parseInt(process.env.MIN_TRANSFER_AMOUNT || '100', 10),
    refundWindowHours: parseInt(process.env.REFUND_WINDOW_HOURS || '72', 10),
    maxBookingsPerSalonPerDay: parseInt(process.env.MAX_BOOKINGS_PER_SALON_PER_DAY || '50', 10),
    incentiveBookingThreshold: parseInt(process.env.INCENTIVE_BOOKING_THRESHOLD || '150', 10),
    incentiveAmount: parseInt(process.env.INCENTIVE_AMOUNT || '10000', 10),
    paymentHoldMinutes: parseInt(process.env.PAYMENT_HOLD_MINUTES || '10', 10),
    maxBookingAmount: parseInt(process.env.MAX_BOOKING_AMOUNT || '100000', 10),
  },

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : '*'),
} as const;

export default config;
