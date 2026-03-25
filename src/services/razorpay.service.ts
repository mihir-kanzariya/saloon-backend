import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../config';
import { ApiError } from '../utils/apiError';
import { auditLog } from '../utils/audit-logger';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = [502, 503, 504];
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'];

class RazorpayService {
  private rzp: any;
  private static instance: RazorpayService;

  private constructor() {
    this.rzp = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  static getInstance(): RazorpayService {
    if (!RazorpayService.instance) {
      RazorpayService.instance = new RazorpayService();
    }
    return RazorpayService.instance;
  }

  // ==========================================
  // Retry wrapper with exponential backoff
  // ==========================================

  private async retryWithBackoff(fn: () => Promise<any>, method: string): Promise<any> {
    let lastError: any;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const statusCode = error.statusCode || 0;
        const errorCode = error.code || '';

        const isRetryable = RETRYABLE_STATUS_CODES.includes(statusCode)
          || RETRYABLE_ERROR_CODES.includes(errorCode);

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw this.handleError(error, method);
        }

        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[RazorpayService.${method}] Attempt ${attempt} failed (${statusCode || errorCode}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw this.handleError(lastError, method);
  }

  // ==========================================
  // Orders
  // ==========================================

  async createOrder(params: {
    amount: number;
    currency?: string;
    receipt: string;
    notes?: Record<string, string>;
  }) {
    return this.retryWithBackoff(() => this.rzp.orders.create({
      amount: params.amount,
      currency: params.currency || 'INR',
      receipt: params.receipt,
      notes: params.notes || {},
    }), 'createOrder');
  }

  async fetchOrder(orderId: string) {
    return this.retryWithBackoff(() => this.rzp.orders.fetch(orderId), 'fetchOrder');
  }

  // ==========================================
  // Payments
  // ==========================================

  async fetchPayment(paymentId: string) {
    return this.retryWithBackoff(() => this.rzp.payments.fetch(paymentId), 'fetchPayment');
  }

  // ==========================================
  // Linked Accounts (Route v2)
  // ==========================================

  async createLinkedAccount(params: {
    email: string;
    phone: string;
    legal_business_name: string;
    business_type?: string;
    contact_name: string;
    profile?: Record<string, any>;
    legal_info?: { pan?: string; gst?: string };
    contact_info?: Record<string, any>;
  }) {
    return this.retryWithBackoff(() => this.rzp.accounts.create(params), 'createLinkedAccount');
  }

  async fetchLinkedAccount(accountId: string) {
    return this.retryWithBackoff(() => this.rzp.accounts.fetch(accountId), 'fetchLinkedAccount');
  }

  async updateLinkedAccount(accountId: string, params: Record<string, any>) {
    return this.retryWithBackoff(() => this.rzp.accounts.edit(accountId, params), 'updateLinkedAccount');
  }

  async deleteLinkedAccount(accountId: string) {
    return this.retryWithBackoff(() => this.rzp.accounts.delete(accountId), 'deleteLinkedAccount');
  }

  // ==========================================
  // Product Configuration (bank account setup)
  // ==========================================

  async requestProductConfig(accountId: string, params: {
    product_name: string;
    tnc_accepted: boolean;
    ip: string;
  }) {
    return this.retryWithBackoff(
      () => this.rzp.products.requestProductConfiguration(accountId, params),
      'requestProductConfig'
    );
  }

  async updateProductConfig(accountId: string, productId: string, params: {
    settlements?: { account_number: string; ifsc_code: string; beneficiary_name: string };
    tnc_accepted?: boolean;
    ip?: string;
  }) {
    return this.retryWithBackoff(
      () => this.rzp.products.edit(accountId, productId, params),
      'updateProductConfig'
    );
  }

  async fetchProductConfig(accountId: string, productId: string) {
    return this.retryWithBackoff(
      () => this.rzp.products.fetch(accountId, productId),
      'fetchProductConfig'
    );
  }

  // ==========================================
  // Transfers (Route) — Direct transfers for weekly settlement
  // ==========================================

  async createDirectTransfer(params: {
    account: string;
    amount: number;
    currency?: string;
    notes?: Record<string, string>;
  }) {
    const result = await this.retryWithBackoff(() => this.rzp.transfers.create({
      account: params.account,
      amount: params.amount,
      currency: params.currency || 'INR',
      notes: params.notes || {},
    }), 'createDirectTransfer');

    auditLog('razorpay.transfer.created', {
      transfer_id: result.id,
      account: params.account,
      amount: params.amount,
    });

    return result;
  }

  async fetchTransfer(transferId: string) {
    return this.retryWithBackoff(() => this.rzp.transfers.fetch(transferId), 'fetchTransfer');
  }

  // ==========================================
  // Refunds
  // ==========================================

  async createRefund(paymentId: string, params: {
    amount: number;
    speed?: 'normal' | 'optimum';
    notes?: Record<string, string>;
    receipt?: string;
  }) {
    const result = await this.retryWithBackoff(() => this.rzp.payments.refund(paymentId, {
      amount: params.amount,
      speed: params.speed || 'normal',
      notes: params.notes || {},
      receipt: params.receipt,
    }), 'createRefund');

    auditLog('razorpay.refund.created', {
      refund_id: result.id,
      payment_id: paymentId,
      amount: params.amount,
    });

    return result;
  }

  // ==========================================
  // Signature Verification (timing-safe)
  // ==========================================

  verifyPaymentSignature(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${params.orderId}|${params.paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(params.signature, 'utf8')
      );
    } catch {
      return false; // Different lengths
    }
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', config.razorpay.webhookSecret)
        .update(body)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  // ==========================================
  // Utility
  // ==========================================

  toPaise(amount: number): number {
    return Math.round(amount * 100);
  }

  fromPaise(paise: number): number {
    return paise / 100;
  }

  // ==========================================
  // Error Handler
  // ==========================================

  private handleError(error: any, method: string): ApiError {
    const statusCode = error.statusCode || 500;
    const razorpayError = error.error || {};
    const description = razorpayError.description || error.message || 'Razorpay API error';
    const errorCode = razorpayError.code || 'UNKNOWN';

    console.error(`[RazorpayService.${method}] Error:`, { statusCode, errorCode, description });

    if (statusCode === 400) return ApiError.badRequest(`Razorpay: ${description}`);
    if (statusCode === 401) return ApiError.internal('Razorpay authentication failed');
    return ApiError.internal(`Razorpay error: ${description}`);
  }
}

export default RazorpayService;
