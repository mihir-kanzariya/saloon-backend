import { body, param } from 'express-validator';

export const createServiceValidation = [
  body('salon_id').isUUID().withMessage('Invalid salon ID'),
  body('name').trim().notEmpty().withMessage('Service name is required').isLength({ max: 200 }),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('duration_minutes').isInt({ min: 5 }).withMessage('Duration must be at least 5 minutes'),
  body('category_id').optional().isUUID(),
  body('description').optional().trim(),
  body('discounted_price').optional().isFloat({ min: 0 }),
  body('gender').optional().isIn(['men', 'women', 'unisex']),
];

export const updateServiceValidation = [
  param('serviceId').isUUID().withMessage('Invalid service ID'),
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('price').optional().isFloat({ min: 0 }),
  body('duration_minutes').optional().isInt({ min: 5 }),
  body('discounted_price').optional().isFloat({ min: 0 }),
  body('gender').optional().isIn(['men', 'women', 'unisex']),
  body('is_active').optional().isBoolean(),
];
