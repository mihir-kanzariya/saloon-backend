import { body } from 'express-validator';

export const createLinkedAccountValidator = [
  body('legal_business_name')
    .isString().isLength({ min: 3, max: 200 })
    .withMessage('Legal business name must be 3-200 characters'),
  body('business_type')
    .optional()
    .isIn(['individual', 'proprietorship', 'partnership', 'private_limited', 'public_limited', 'llp', 'ngo', 'trust', 'society', 'not_yet_registered', 'huf'])
    .withMessage('Invalid business type'),
  body('contact_name')
    .isString().isLength({ min: 2, max: 200 })
    .withMessage('Contact name must be 2-200 characters'),
  body('contact_email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('contact_phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit Indian phone number required'),
  body('pan')
    .optional({ nullable: true })
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .withMessage('Invalid PAN format (e.g., ABCDE1234F)'),
  body('gst')
    .optional({ nullable: true })
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/)
    .withMessage('Invalid GST format'),
  body('bank_account_number')
    .isString().isLength({ min: 9, max: 18 })
    .withMessage('Bank account number must be 9-18 digits'),
  body('bank_ifsc')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC format (e.g., HDFC0001234)'),
  body('bank_beneficiary_name')
    .isString().isLength({ min: 3, max: 200 })
    .withMessage('Beneficiary name must be 3-200 characters'),
];

export const updateLinkedAccountValidator = [
  body('bank_account_number')
    .optional()
    .isString().isLength({ min: 9, max: 18 })
    .withMessage('Bank account number must be 9-18 digits'),
  body('bank_ifsc')
    .optional()
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .withMessage('Invalid IFSC format'),
  body('bank_beneficiary_name')
    .optional()
    .isString().isLength({ min: 3, max: 200 })
    .withMessage('Beneficiary name must be 3-200 characters'),
  body('contact_email')
    .optional()
    .isEmail()
    .withMessage('Valid email required'),
  body('contact_phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit phone required'),
];
