import { body, param } from 'express-validator';

export const sendMessageValidator = [
  param('roomId').isUUID().withMessage('Invalid room ID'),
  body('content').isString().trim().isLength({ min: 1, max: 5000 }).withMessage('Message content required (max 5000 chars)'),
  body('message_type').optional().isIn(['text', 'image']).withMessage('Invalid message type'),
];
