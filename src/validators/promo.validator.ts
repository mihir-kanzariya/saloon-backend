import { body } from 'express-validator';

export const promoValidateValidator = [
  body('code')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Promo code is required'),
  body('salon_id')
    .isUUID()
    .withMessage('Valid salon ID is required'),
  body('subtotal')
    .isFloat({ gt: 0 })
    .withMessage('Subtotal must be greater than 0'),
];
