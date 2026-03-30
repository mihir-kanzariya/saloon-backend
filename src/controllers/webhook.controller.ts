import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Payment, Booking, SalonEarning, LinkedAccount, Salon, Transfer, WebhookEvent } from '../models';
import RazorpayService from '../services/razorpay.service';
import { createEarningIfNotExists } from '../utils/earning.helper';
import { WalletService } from '../services/wallet.service';
import { auditLog } from '../utils/audit-logger';
import { NotificationService } from '../services/notification.service';
import User from '../models/User';
import config from '../config';

export class WebhookController {
  /**
   * POST /webhooks/razorpay
   * Handle all Razorpay webhook events.
   * No auth — verified via HMAC signature. Always returns 200.
   */
  static async handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = typeof req.body === 'string' ? req.body : (req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body));
      const signature = req.headers['x-razorpay-signature'] as string;

      if (!signature) {
        res.status(200).json({ status: 'ignored', reason: 'no signature' });
        return;
      }

      // Verify HMAC signature
      const rzp = RazorpayService.getInstance();
      const isValid = rzp.verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn('[Webhook] Invalid signature');
        res.status(200).json({ status: 'ignored', reason: 'invalid signature' });
        return;
      }

      const payload = typeof req.body === 'string' || req.body instanceof Buffer
        ? JSON.parse(rawBody)
        : req.body;

      const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
      const eventType = payload.event;
      const entity = payload.payload?.payment?.entity
        || payload.payload?.transfer?.entity
        || payload.payload?.refund?.entity
        || payload.payload?.account?.entity
        || {};

      // Atomic idempotency check — findOrCreate prevents race conditions
      const [webhookEvent, created] = await WebhookEvent.findOrCreate({
        where: { event_id: eventId },
        defaults: {
          event_id: eventId,
          event_type: eventType,
          entity_type: entity.entity || 'unknown',
          entity_id: entity.id || null,
          payload,
          status: 'processing',
        },
      });

      if (!created) {
        if (webhookEvent.status === 'processed') {
          res.status(200).json({ status: 'already_processed' });
          return;
        }
        // Retry a failed event
        await webhookEvent.update({ status: 'processing', retry_count: (webhookEvent.retry_count || 0) + 1 });
      }

      auditLog('webhook.received', { event_id: eventId, event_type: eventType, entity_id: entity.id });

      try {
        // Route to handler based on event type
        switch (eventType) {
          case 'payment.captured':
            await WebhookController.handlePaymentCaptured(payload);
            break;
          case 'payment.failed':
            await WebhookController.handlePaymentFailed(payload);
            break;
          case 'transfer.processed':
            await WebhookController.handleTransferProcessed(payload);
            break;
          case 'transfer.settled':
            await WebhookController.handleTransferSettled(payload);
            break;
          case 'transfer.failed':
            await WebhookController.handleTransferFailed(payload);
            break;
          case 'refund.processed':
            await WebhookController.handleRefundProcessed(payload);
            break;
          case 'account.activated':
          case 'account.suspended':
          case 'account.needs_clarification':
          case 'account.under_review':
            await WebhookController.handleAccountStatusChange(payload);
            break;
          default:
            console.log(`[Webhook] Unhandled event type: ${eventType}`);
        }

        await webhookEvent.update({ status: 'processed', processed_at: new Date() });
      } catch (handlerError: any) {
        console.error(`[Webhook] Handler error for ${eventType}:`, handlerError.message);
        await webhookEvent.update({
          status: 'failed',
          error_message: handlerError.message,
        });
      }

      res.status(200).json({ status: 'ok' });
    } catch (error: any) {
      console.error('[Webhook] Fatal error:', error.message);
      // Always return 200 to prevent Razorpay retries on our errors
      res.status(200).json({ status: 'error' });
    }
  }

  private static async handlePaymentCaptured(payload: any): Promise<void> {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) return;

    const payment = await Payment.findOne({
      where: { razorpay_order_id: paymentEntity.order_id },
    });
    if (!payment) return;
    if (payment.status === 'captured') return; // idempotent

    await sequelize.transaction(async (t) => {
      await payment.update({
        razorpay_payment_id: paymentEntity.id,
        status: 'captured',
        method: paymentEntity.method,
        razorpay_fee: paymentEntity.fee ? paymentEntity.fee / 100 : null,
        razorpay_tax: paymentEntity.tax ? paymentEntity.tax / 100 : null,
        captured_at: new Date(),
      }, { transaction: t });

      const booking = await Booking.findByPk(payment.booking_id, { transaction: t });
      if (!booking) return;

      const isFullyPaid = payment.payment_type === 'full' ||
        (payment.payment_type === 'token' && parseFloat(payment.amount) >= parseFloat(booking.total_amount));

      const newPaymentStatus = isFullyPaid ? 'paid' : 'token_paid';

      await booking.update({
        payment_status: newPaymentStatus,
        ...(newPaymentStatus === 'paid' && booking.payment_mode === 'online'
          ? { settlement_status: 'pending_settlement' }
          : {}),
      }, { transaction: t });

      // Create SalonEarning if fully paid (atomic dedup via findOrCreate)
      if (newPaymentStatus === 'paid') {
        await createEarningIfNotExists({
          bookingId: booking.id,
          salonId: booking.salon_id,
          totalAmount: parseFloat(booking.total_amount),
          transaction: t,
        });
      }

      // Send notifications (non-blocking, after transaction)
      const amount = parseFloat(payment.amount);
      const methodLabel = paymentEntity.method === 'upi' ? 'UPI' : paymentEntity.method === 'card' ? 'Card' : paymentEntity.method || 'Online';

      // Notify customer: "Payment successful"
      NotificationService.send({
        userId: payment.user_id,
        title: 'Payment Successful',
        body: `Your payment of ₹${amount} via ${methodLabel} for booking #${booking.booking_number} has been received.`,
        type: 'payment_success',
        data: { booking_id: booking.id, payment_id: payment.id, amount: String(amount) },
      }).catch(() => {});

      // Notify salon: "Payment received"
      NotificationService.sendToSalonMembers({
        salonId: booking.salon_id,
        title: 'Payment Received',
        body: `₹${amount} received via ${methodLabel} for booking #${booking.booking_number}.`,
        type: 'payment_received',
        data: { booking_id: booking.id, amount: String(amount) },
        roles: ['owner', 'manager', 'receptionist'],
      }).catch(() => {});
    });
  }

  private static async handlePaymentFailed(payload: any): Promise<void> {
    const paymentEntity = payload.payload?.payment?.entity;
    if (!paymentEntity) return;

    const payment = await Payment.findOne({ where: { razorpay_order_id: paymentEntity.order_id } });

    await Payment.update(
      { status: 'failed', razorpay_payment_id: paymentEntity.id, method: paymentEntity.method },
      { where: { razorpay_order_id: paymentEntity.order_id } }
    );

    // Notify customer: "Payment failed"
    if (payment) {
      const booking = await Booking.findByPk(payment.booking_id, { attributes: ['id', 'booking_number', 'salon_id'] });
      NotificationService.send({
        userId: payment.user_id,
        title: 'Payment Failed',
        body: `Your payment for booking #${booking?.booking_number || ''} could not be processed. Please try again or use a different payment method.`,
        type: 'payment_failed',
        data: { booking_id: payment.booking_id, payment_id: payment.id },
      }).catch(() => {});

      // Notify salon
      if (booking) {
        NotificationService.sendToSalonMembers({
          salonId: booking.salon_id,
          title: 'Customer Payment Failed',
          body: `Payment failed for booking #${booking.booking_number}. Customer may retry.`,
          type: 'payment_failed',
          data: { booking_id: booking.id },
          roles: ['owner', 'manager'],
        }).catch(() => {});
      }
    }
  }

  private static async handleTransferProcessed(payload: any): Promise<void> {
    const transferEntity = payload.payload?.transfer?.entity;
    if (!transferEntity) return;

    await Transfer.update(
      { status: 'processed' },
      { where: { razorpay_transfer_id: transferEntity.id } }
    );

    // Notify salon owner: "Transfer processed"
    const transfer = await Transfer.findOne({ where: { razorpay_transfer_id: transferEntity.id } });
    if (transfer) {
      const salon = await Salon.findByPk(transfer.salon_id, { attributes: ['id', 'owner_id', 'name'] });
      if (salon) {
        NotificationService.send({
          userId: salon.owner_id,
          title: 'Payout Initiated',
          body: `₹${transfer.amount} payout for ${salon.name} has been processed. It will reach your bank in 1-2 business days.`,
          type: 'transfer_processed',
          data: { salon_id: salon.id, transfer_id: transfer.id, amount: String(transfer.amount) },
        }).catch(() => {});
      }
    }
  }

  private static async handleTransferSettled(payload: any): Promise<void> {
    const transferEntity = payload.payload?.transfer?.entity;
    if (!transferEntity) return;

    await Transfer.update(
      { status: 'settled' },
      { where: { razorpay_transfer_id: transferEntity.id } }
    );

    // Notify salon owner: "Payout settled to bank"
    const transfer = await Transfer.findOne({ where: { razorpay_transfer_id: transferEntity.id } });
    if (transfer) {
      const salon = await Salon.findByPk(transfer.salon_id, { attributes: ['id', 'owner_id', 'name'] });
      if (salon) {
        NotificationService.send({
          userId: salon.owner_id,
          title: 'Payout Settled',
          body: `₹${transfer.amount} has been credited to your bank account for ${salon.name}. Check your bank statement.`,
          type: 'transfer_settled',
          data: { salon_id: salon.id, transfer_id: transfer.id, amount: String(transfer.amount) },
        }).catch(() => {});
      }
    }
  }

  private static async handleTransferFailed(payload: any): Promise<void> {
    const transferEntity = payload.payload?.transfer?.entity;
    if (!transferEntity) return;

    // Atomic rollback — wrap in transaction
    await sequelize.transaction(async (t) => {
      const transfer = await Transfer.findOne({
        where: { razorpay_transfer_id: transferEntity.id },
        transaction: t,
      });

      if (!transfer) return;

      await transfer.update({
        status: 'failed',
        error_reason: transferEntity.error?.description || 'Transfer failed',
      }, { transaction: t });

      const bookingIds = transfer.metadata?.booking_ids || [];
      if (bookingIds.length > 0) {
        await SalonEarning.update(
          { status: 'ready_for_settlement', transfer_id: null, settlement_batch_id: null },
          { where: { booking_id: { [Op.in]: bookingIds } }, transaction: t }
        );
        await Booking.update(
          { settlement_status: 'pending_settlement', settlement_batch_id: null, settled_at: null },
          { where: { id: { [Op.in]: bookingIds } }, transaction: t }
        );
      }

      auditLog('transfer.failed.rollback', {
        transfer_id: transfer.id,
        razorpay_transfer_id: transferEntity.id,
        booking_count: bookingIds.length,
      });

      // Notify salon owner: "Transfer failed, will retry"
      const salon = await Salon.findByPk(transfer.salon_id, { attributes: ['id', 'owner_id', 'name'], transaction: t });
      if (salon) {
        NotificationService.send({
          userId: salon.owner_id,
          title: 'Payout Delayed',
          body: `Your payout of ₹${transfer.amount} for ${salon.name} could not be processed. It will be retried in the next settlement cycle.`,
          type: 'transfer_failed',
          data: { salon_id: salon.id, transfer_id: transfer.id, amount: String(transfer.amount) },
        }).catch(() => {});
      }
    });
  }

  private static async handleRefundProcessed(payload: any): Promise<void> {
    const refundEntity = payload.payload?.refund?.entity;
    if (!refundEntity) return;

    const payment = await Payment.findOne({
      where: { razorpay_payment_id: refundEntity.payment_id },
    });

    if (payment) {
      const refundAmount = refundEntity.amount / 100;
      const totalRefunded = parseFloat(payment.refund_amount || 0) + refundAmount;
      const isFullRefund = totalRefunded >= parseFloat(payment.amount);

      await payment.update({
        refund_amount: totalRefunded,
        refund_id: refundEntity.id,
        refund_status: isFullRefund ? 'full' : 'partial',
      });

      // Notify customer: "Refund processed"
      const booking = await Booking.findByPk(payment.booking_id, { attributes: ['id', 'booking_number'] });
      NotificationService.send({
        userId: payment.user_id,
        title: 'Refund Processed',
        body: `Your refund of ₹${refundAmount} for booking #${booking?.booking_number || ''} has been processed. It will reflect in your account within 5-7 business days.`,
        type: 'refund_processed',
        data: { booking_id: payment.booking_id, refund_amount: String(refundAmount) },
      }).catch(() => {});
    }
  }

  private static async handleAccountStatusChange(payload: any): Promise<void> {
    const accountEntity = payload.payload?.account?.entity;
    if (!accountEntity) return;

    const linkedAccount = await LinkedAccount.findOne({
      where: { razorpay_account_id: accountEntity.id },
    });

    if (!linkedAccount) return;

    let kycStatus = linkedAccount.kyc_status;
    let payoutEnabled = false;

    if (accountEntity.status === 'activated') {
      kycStatus = 'verified';
      payoutEnabled = true;
    } else if (accountEntity.status === 'suspended') {
      kycStatus = 'failed';
    } else if (['needs_clarification', 'under_review'].includes(accountEntity.status)) {
      kycStatus = 'pending';
    }

    await linkedAccount.update({
      status: accountEntity.status,
      kyc_status: kycStatus,
      ...(accountEntity.status === 'activated' ? { activated_at: new Date() } : {}),
    });

    await Salon.update(
      { kyc_status: kycStatus, payout_enabled: payoutEnabled },
      { where: { id: linkedAccount.salon_id } }
    );

    // Notify salon owner about KYC/account status change
    const salon = await Salon.findByPk(linkedAccount.salon_id, { attributes: ['id', 'owner_id', 'name'] });
    if (salon) {
      const messages: Record<string, { title: string; body: string }> = {
        activated: {
          title: 'Account Verified',
          body: `Great news! Your KYC for ${salon.name} has been verified. You can now receive online payments and payouts.`,
        },
        suspended: {
          title: 'Account Suspended',
          body: `Your account for ${salon.name} has been suspended. Online payments are temporarily disabled. Please contact support for help.`,
        },
        needs_clarification: {
          title: 'KYC Review Required',
          body: `Your KYC verification for ${salon.name} needs additional information. Please update your documents in the payment setup section.`,
        },
        under_review: {
          title: 'KYC Under Review',
          body: `Your KYC documents for ${salon.name} are being reviewed. This usually takes 1-2 business days.`,
        },
      };

      const msg = messages[accountEntity.status];
      if (msg) {
        NotificationService.send({
          userId: salon.owner_id,
          title: msg.title,
          body: msg.body,
          type: `account_${accountEntity.status}`,
          data: { salon_id: salon.id, account_status: accountEntity.status, kyc_status: kycStatus },
        }).catch(() => {});
      }
    }
  }
}
