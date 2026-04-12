import { body, param, query } from 'express-validator';

export const createReviewValidation = [
  body('booking_id').isUUID().withMessage('Invalid booking ID'),
  body('salon_rating').isInt({ min: 1, max: 5 }).withMessage('Salon rating must be 1-5'),
  body('stylist_rating').optional().isInt({ min: 1, max: 5 }).withMessage('Stylist rating must be 1-5'),
  body('comment').optional().trim().isLength({ max: 1000 }),
];

export const replyReviewValidation = [
  param('reviewId').isUUID().withMessage('Invalid review ID'),
  body('reply').trim().notEmpty().withMessage('Reply is required').isLength({ max: 1000 }),
];

export const updateReviewValidation = [
  body('salon_rating').optional().isInt({ min: 1, max: 5 }),
  body('stylist_rating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().isString().isLength({ max: 1000 }),
];

export const reviewListValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
];
