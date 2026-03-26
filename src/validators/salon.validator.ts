import { body, param } from 'express-validator';

export const createSalonValidation = [
  body('name').trim().notEmpty().withMessage('Salon name is required').isLength({ max: 200 }),
  body('phone').trim().notEmpty().withMessage('Phone is required').matches(/^[0-9]{10}$/),
  body('address').trim().notEmpty().withMessage('Address is required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
  body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  body('gender_type').optional().isIn(['men', 'women', 'unisex']),
  body('city').optional().trim().isLength({ max: 100 }),
  body('state').optional().trim().isLength({ max: 100 }),
  body('pincode').optional().trim().isLength({ max: 10 }),
];

export const updateSalonValidation = [
  param('salonId').isUUID().withMessage('Invalid salon ID'),
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('phone').optional().trim().matches(/^[0-9]{10}$/),
  body('address').optional().trim().notEmpty(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  body('gender_type').optional().isIn(['men', 'women', 'unisex']),
];

export const salonIdValidation = [
  param('salonId').isUUID().withMessage('Invalid salon ID'),
];
