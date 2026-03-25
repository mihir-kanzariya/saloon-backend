import { body, param, query } from 'express-validator';

export const createBookingValidation = [
  body('salon_id').isUUID().withMessage('Invalid salon ID'),
  body('service_ids').isArray({ min: 1 }).withMessage('At least one service is required'),
  body('service_ids.*').isUUID().withMessage('Invalid service ID'),
  body('booking_date').isDate().withMessage('Valid booking date is required'),
  body('start_time').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Start time must be HH:mm format'),
  body('stylist_member_id').optional().isUUID(),
  body('payment_mode').optional().isIn(['online', 'pay_at_salon', 'token']),
  body('customer_notes').optional().trim().isLength({ max: 500 }),
];

export const updateBookingStatusValidation = [
  param('bookingId').isUUID().withMessage('Invalid booking ID'),
  body('status').isIn(['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).withMessage('Invalid status'),
  body('cancellation_reason').optional().trim().isLength({ max: 500 }),
];

export const bookingIdValidation = [
  param('bookingId').isUUID().withMessage('Invalid booking ID'),
];

export const bookingListValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('status').optional().isIn(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
];
