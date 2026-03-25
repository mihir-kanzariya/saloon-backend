import { body, param } from 'express-validator';

export const createMemberValidator = [
  body('salon_id').isUUID().withMessage('Invalid salon ID'),
  body('user_id').isUUID().withMessage('Invalid user ID'),
  body('role').isIn(['stylist', 'manager', 'receptionist']).withMessage('Invalid role'),
  body('commission_percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Commission must be 0-100'),
];

export const updateMemberValidator = [
  param('memberId').isUUID().withMessage('Invalid member ID'),
  body('role').optional().isIn(['stylist', 'manager', 'receptionist']).withMessage('Invalid role'),
  body('commission_percentage').optional().isFloat({ min: 0, max: 100 }).withMessage('Commission must be 0-100'),
];

export const assignServicesValidator = [
  param('memberId').isUUID().withMessage('Invalid member ID'),
  body('services').isArray().withMessage('Services must be an array'),
  body('services.*.service_id').isUUID().withMessage('Invalid service ID'),
];

export const setAvailabilityValidator = [
  param('memberId').isUUID().withMessage('Invalid member ID'),
  body('availability').isArray().withMessage('Availability must be an array'),
  body('availability.*.day_of_week').isIn(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']),
  body('availability.*.start_time').matches(/^\d{2}:\d{2}$/).withMessage('Invalid start time format'),
  body('availability.*.end_time').matches(/^\d{2}:\d{2}$/).withMessage('Invalid end time format'),
  body('availability.*.is_available').isBoolean(),
];

export const addBreakValidator = [
  param('memberId').isUUID().withMessage('Invalid member ID'),
  body('break_type').isIn(['recurring', 'one_time']).withMessage('Invalid break type'),
  body('start_time').matches(/^\d{2}:\d{2}$/).withMessage('Invalid start time'),
  body('end_time').matches(/^\d{2}:\d{2}$/).withMessage('Invalid end time'),
];

export const addLeaveValidator = [
  param('memberId').isUUID().withMessage('Invalid member ID'),
  body('date').isISO8601().withMessage('Invalid date format'),
];
