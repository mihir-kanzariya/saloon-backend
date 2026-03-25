import { body } from 'express-validator';

export const createOrderValidator = [
  body('booking_id').isUUID().withMessage('Invalid booking ID'),
  body('payment_type').optional().isIn(['full', 'token']).withMessage('Invalid payment type'),
];

export const verifyPaymentValidator = [
  body('razorpay_order_id').isString().notEmpty().withMessage('Order ID required'),
  body('razorpay_payment_id').isString().notEmpty().withMessage('Payment ID required'),
  body('razorpay_signature').isString().notEmpty().withMessage('Signature required'),
];

export const withdrawValidator = [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be positive'),
  body('bank_details').isObject().withMessage('Bank details required'),
  body('bank_details.account_number').isString().notEmpty(),
  body('bank_details.ifsc_code').isString().notEmpty(),
  body('bank_details.account_holder_name').isString().notEmpty(),
];
