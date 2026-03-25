import { body } from 'express-validator';

export const sendOtpValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10}$/).withMessage('Phone number must be 10 digits'),
];

export const verifyOtpValidation = [
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10}$/).withMessage('Phone number must be 10 digits'),
  body('otp').trim().notEmpty().withMessage('OTP is required')
    .isLength({ min: 4, max: 6 }).withMessage('OTP must be 4-6 digits'),
];

export const updateProfileValidation = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email').optional().trim().isEmail().withMessage('Invalid email format'),
  body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
];
