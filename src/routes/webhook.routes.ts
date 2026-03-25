import { Router } from 'express';
import express from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();

// POST /webhooks/razorpay — Razorpay webhook handler
// No auth required — verified via HMAC signature
// Uses raw body parser for signature verification
router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  WebhookController.handleRazorpayWebhook
);

export default router;
