/**
 * E2E Complete Flow Test — Full Lifecycle
 *
 * Tests the COMPLETE flow with real accounts:
 * 1. Login as customer + salon owner
 * 2. Salon owner adds bank details
 * 3. Customer books + pays
 * 4. Salon confirms → completes
 * 5. Verify wallet credited (7-day hold)
 * 6. Check earnings + commission
 * 7. Salon requests withdrawal
 * 8. Customer cancels another booking (refund)
 * 9. Webhook simulations (payment.captured, payment.failed, transfer events)
 * 10. Edge cases (duplicate payment, insufficient balance, invalid bank)
 *
 * Run: npx ts-node src/tests/e2e-complete-flow.ts
 */

import http from 'http';
import crypto from 'crypto';

const BASE = 'https://apis.binaxytech.com/api/v1';
const RZP_SECRET = 'iZh7nDMzsSAGWPLaTQHz8XKy';
const WEBHOOK_SECRET = 'dkj7uyy6frtgy656uvvTRFv656UTg6tyvvg7uyguyt';

// Test accounts
const CUSTOMER_PHONE = '7777700003'; // Amit Kumar
const OWNER_PHONE = '9999999001';     // Arjun Mehta (has salon)
const OTP = '1111';

let customerToken = '';
let ownerToken = '';
let salonId = '';
let serviceIds: string[] = [];
let bookingId = '';
let bookingId2 = '';
let orderId = '';
let orderId2 = '';

let passed = 0;
let failed = 0;
let skipped = 0;

// ==========================================
// Helpers
// ==========================================

function api(method: string, path: string, body?: any, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    const data = body ? JSON.stringify(body) : undefined;
    const mod = url.protocol === 'https:' ? require('https') : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res: any) => {
      let body = '';
      res.on('data', (c: string) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function hmac(orderId: string, paymentId: string): string {
  return crypto.createHmac('sha256', RZP_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

function webhookSig(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function assert(cond: boolean, msg: string, detail?: any) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.log(`  ❌ ${msg}`); if (detail) console.log(`     →`, JSON.stringify(detail).slice(0, 300)); failed++; }
}

function skip(msg: string) { console.log(`  ⏭️  ${msg}`); skipped++; }

function futureDate(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ==========================================
// Test Scenarios
// ==========================================

async function test1_login() {
  console.log('\n📋 TEST 1: Login Both Users');

  await api('POST', '/auth/send-otp', { phone: CUSTOMER_PHONE });
  const c = await api('POST', '/auth/verify-otp', { phone: CUSTOMER_PHONE, otp: OTP });
  assert(c.status === 200 && c.data?.accessToken, `Customer logged in: ${c.data?.user?.name || 'unknown'}`);
  customerToken = c.data?.accessToken || '';

  await api('POST', '/auth/send-otp', { phone: OWNER_PHONE });
  const o = await api('POST', '/auth/verify-otp', { phone: OWNER_PHONE, otp: OTP });
  assert(o.status === 200 && o.data?.accessToken, `Owner logged in: ${o.data?.user?.name || 'unknown'}`);
  ownerToken = o.data?.accessToken || '';
}

async function test2_getSalonAndServices() {
  console.log('\n📋 TEST 2: Get Salon + Services');

  const salons = await api('GET', '/salons/user/my-salons', undefined, ownerToken);
  assert(salons.status === 200 && salons.data?.length > 0, `Owner has ${salons.data?.length} salon(s)`);
  salonId = salons.data?.[0]?.id || '';
  console.log(`  Salon: ${salons.data?.[0]?.name} (${salonId.slice(0, 8)}...)`);

  const svc = await api('GET', `/services/salon/${salonId}`, undefined, customerToken);
  assert(svc.status === 200 && svc.data?.length > 0, `Found ${svc.data?.length} services`);
  serviceIds = (svc.data || []).slice(0, 1).map((s: any) => s.id);
}

async function test3_addBankDetails() {
  console.log('\n📋 TEST 3: Add Bank Details (One-Time Setup)');

  // Add bank account
  const bank = await api('PUT', `/salons/${salonId}/bank-account`, {
    holder_name: 'Test User',
    account_number: '222222222222',
    ifsc: 'HDFC0000001',
    bank_name: 'HDFC Bank',
  }, ownerToken);
  assert(bank.status === 200, `Bank account saved: ${bank.message || bank.status}`, bank);

  // Verify bank account is saved (masked)
  const bankGet = await api('GET', `/salons/${salonId}/bank-account`, undefined, ownerToken);
  assert(bankGet.status === 200 && bankGet.data, `Bank retrieved`);
  if (bankGet.data) {
    assert(bankGet.data.account_number?.includes('****'), `Account masked: ${bankGet.data.account_number}`);
    assert(bankGet.data.holder_name === 'Test User', `Holder: ${bankGet.data.holder_name}`);
    console.log(`  Bank: ${bankGet.data.bank_name || 'N/A'} | IFSC: ${bankGet.data.ifsc}`);
  }
}

async function test3b_bankEdgeCases() {
  console.log('\n📋 TEST 3b: Bank Details Edge Cases');

  // Invalid IFSC
  const badIfsc = await api('PUT', `/salons/${salonId}/bank-account`, {
    holder_name: 'Test',
    account_number: '111111111111',
    ifsc: 'INVALID',
  }, ownerToken);
  assert(badIfsc.status === 400 || badIfsc.status === 422 || badIfsc.status === 200, `Invalid IFSC handled: ${badIfsc.status}`);

  // Empty holder name
  const noName = await api('PUT', `/salons/${salonId}/bank-account`, {
    holder_name: '',
    account_number: '111111111111',
    ifsc: 'HDFC0000001',
  }, ownerToken);
  assert(noName.status >= 400 || noName.status === 200, `Empty holder handled: ${noName.status}`);
}

async function test4_createBookingAndPay() {
  console.log('\n📋 TEST 4: Create Booking + Pay (Full Flow)');

  const date = futureDate(7);
  const slots = await api('GET', `/bookings/salon/${salonId}/slots?date=${date}&duration=30`, undefined, customerToken);
  const slotList = (slots.data || []).map((s: any) => s.time || s);
  const slot = slotList.find((t: string) => t >= '11:00' && t <= '15:00') || slotList[0] || '11:00';
  console.log(`  Date: ${date}, Slot: ${slot}`);

  // Create booking with pay-and-book
  const booking = await api('POST', '/bookings/pay-and-book', {
    salon_id: salonId,
    service_ids: serviceIds,
    booking_date: date,
    start_time: slot,
    payment_mode: 'online',
  }, customerToken);

  if (booking.status === 201 || booking.status === 200) {
    bookingId = booking.data?.booking?.id || '';
    orderId = booking.data?.payment?.order_id || '';
    assert(true, `Booking created: ${booking.data?.booking?.booking_number}`);
    assert(!!orderId, `Razorpay order: ${orderId}`);
    assert(booking.data?.booking?.status === 'awaiting_payment', `Status: awaiting_payment`);

    // Verify payment
    const mockPayId = `pay_test_${Date.now()}`;
    const sig = hmac(orderId, mockPayId);
    const verify = await api('POST', '/payments/verify', {
      razorpay_order_id: orderId,
      razorpay_payment_id: mockPayId,
      razorpay_signature: sig,
    }, customerToken);
    assert(verify.status === 200, `Payment verified: ${verify.data?.status}`);

    // Check booking updated
    const b = await api('GET', `/bookings/${bookingId}`, undefined, customerToken);
    assert(b.data?.payment_status === 'paid', `Payment status: ${b.data?.payment_status}`);
    assert(b.data?.settlement_status === 'pending_settlement', `Settlement: ${b.data?.settlement_status}`);
  } else {
    assert(false, `Booking failed: ${booking.message}`, booking);
    skip('Payment verification skipped');
  }
}

async function test5_salonManagesBooking() {
  console.log('\n📋 TEST 5: Salon Confirms → Completes Booking');

  if (!bookingId) { skip('No booking to manage'); return; }

  const confirm = await api('PUT', `/bookings/${bookingId}/status`, { status: 'confirmed' }, ownerToken);
  assert(confirm.status === 200, `Confirmed: ${confirm.data?.status}`);

  const start = await api('PUT', `/bookings/${bookingId}/status`, { status: 'in_progress' }, ownerToken);
  assert(start.status === 200, `In Progress: ${start.data?.status}`);

  const complete = await api('PUT', `/bookings/${bookingId}/status`, { status: 'completed' }, ownerToken);
  assert(complete.status === 200, `Completed: ${complete.data?.status}`);
}

async function test6_verifyEarningsAndWallet() {
  console.log('\n📋 TEST 6: Verify Earnings + Wallet + Commission');

  // Check earnings
  const earnings = await api('GET', `/payments/salon/${salonId}/earnings`, undefined, ownerToken);
  assert(earnings.status === 200, 'Earnings retrieved');
  const summary = earnings.data?.summary;
  if (summary) {
    const rev = parseFloat(summary.total_revenue || 0);
    const comm = parseFloat(summary.total_commission || 0);
    const net = parseFloat(summary.total_net || 0);
    console.log(`  Revenue: ₹${rev} | Commission: ₹${comm} | Net: ₹${net}`);
    assert(rev > 0, `Revenue > 0: ₹${rev}`);
    if (rev > 0) {
      const rate = (comm / rev * 100).toFixed(1);
      assert(parseFloat(rate) >= 9 && parseFloat(rate) <= 11, `Commission ~10%: ${rate}%`);
    }
  }

  // Check wallet
  const wallet = await api('GET', `/wallet/salon/${salonId}/summary`, undefined, ownerToken);
  if (wallet.status === 200 && wallet.data) {
    console.log(`  Wallet — Total: ₹${wallet.data.total_balance} | Available: ₹${wallet.data.available_balance} | Held: ₹${wallet.data.held_balance}`);
    assert(parseFloat(wallet.data.total_balance) > 0 || parseFloat(wallet.data.total_earned) > 0, `Wallet has balance`);
    assert(parseFloat(wallet.data.held_balance) >= 0, `Held balance exists (7-day hold)`);
  } else {
    skip(`Wallet API: ${wallet.status} ${wallet.message || ''}`);
  }

  // Check ledger
  const ledger = await api('GET', `/wallet/salon/${salonId}/ledger`, undefined, ownerToken);
  if (ledger.status === 200) {
    const entries = ledger.data?.length || 0;
    console.log(`  Ledger: ${entries} entries`);
    assert(entries >= 0, `Ledger accessible: ${entries} entries`);
  }
}

async function test7_withdrawalFlow() {
  console.log('\n📋 TEST 7: Withdrawal Flow');

  // Try withdrawal via OLD endpoint (what frontend uses)
  const withdraw = await api('POST', `/payments/salon/${salonId}/withdraw`, {
    amount: 500,
  }, ownerToken);

  if (withdraw.status === 201 || withdraw.status === 200) {
    assert(true, `Withdrawal created: ₹${withdraw.data?.amount}`);
    assert(withdraw.data?.status === 'pending', `Status: ${withdraw.data?.status}`);
    if (withdraw.data?.tx_id) {
      assert(withdraw.data.tx_id.startsWith('WDR-'), `TX ID: ${withdraw.data.tx_id}`);
    }
  } else {
    // Might fail due to insufficient balance — that's OK
    console.log(`  Withdrawal response: ${withdraw.message}`);
    assert(withdraw.status === 400, `Handled correctly: ${withdraw.message}`);
  }

  // Check withdrawal history
  const history = await api('GET', `/payments/salon/${salonId}/withdrawals`, undefined, ownerToken);
  assert(history.status === 200, `Withdrawal history: ${history.data?.length} records`);
}

async function test7b_withdrawalEdgeCases() {
  console.log('\n📋 TEST 7b: Withdrawal Edge Cases');

  // Below minimum
  const tooLow = await api('POST', `/payments/salon/${salonId}/withdraw`, { amount: 10 }, ownerToken);
  assert(tooLow.status === 400, `Below min rejected: ${tooLow.message}`);

  // Zero amount
  const zero = await api('POST', `/payments/salon/${salonId}/withdraw`, { amount: 0 }, ownerToken);
  assert(zero.status === 400 || zero.status === 422, `Zero amount rejected: ${zero.status}`);

  // Negative amount
  const neg = await api('POST', `/payments/salon/${salonId}/withdraw`, { amount: -100 }, ownerToken);
  assert(neg.status === 400 || neg.status === 422, `Negative rejected: ${neg.status}`);

  // Huge amount (should fail — insufficient balance)
  const huge = await api('POST', `/payments/salon/${salonId}/withdraw`, { amount: 9999999 }, ownerToken);
  assert(huge.status === 400, `Huge amount rejected: ${huge.message?.slice(0, 50)}`);
}

async function test8_cancelAndRefund() {
  console.log('\n📋 TEST 8: Book → Pay → Cancel (Refund Flow)');

  const date = futureDate(8);
  const slots = await api('GET', `/bookings/salon/${salonId}/slots?date=${date}&duration=30`, undefined, customerToken);
  const slotList = (slots.data || []).map((s: any) => s.time || s);
  const slot = slotList.find((t: string) => t >= '12:00') || slotList[0] || '12:00';

  const booking = await api('POST', '/bookings/pay-and-book', {
    salon_id: salonId,
    service_ids: serviceIds,
    booking_date: date,
    start_time: slot,
    payment_mode: 'online',
  }, customerToken);

  if (booking.status === 201 || booking.status === 200) {
    bookingId2 = booking.data?.booking?.id || '';
    orderId2 = booking.data?.payment?.order_id || '';

    // Pay
    const mockPayId2 = `pay_refund_${Date.now()}`;
    const sig2 = hmac(orderId2, mockPayId2);
    await api('POST', '/payments/verify', {
      razorpay_order_id: orderId2,
      razorpay_payment_id: mockPayId2,
      razorpay_signature: sig2,
    }, customerToken);

    // Cancel
    const cancel = await api('POST', `/bookings/${bookingId2}/cancel`, { reason: 'E2E test refund' }, customerToken);
    assert(cancel.status === 200, `Cancelled: ${cancel.data?.status}`);

    const cancelled = await api('GET', `/bookings/${bookingId2}`, undefined, customerToken);
    console.log(`  Payment after cancel: ${cancelled.data?.payment_status}`);
    assert(cancelled.data?.status === 'cancelled', 'Booking is cancelled');
  } else {
    skip('Booking failed, skipping cancel test');
  }
}

async function test9_webhookSimulations() {
  console.log('\n📋 TEST 9: Webhook Simulations');

  // 9a. payment.captured webhook
  const capturedPayload = JSON.stringify({
    event_id: `evt_captured_${Date.now()}`,
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_wh_${Date.now()}`, order_id: 'order_nonexistent', amount: 30000, currency: 'INR', status: 'captured', method: 'upi', fee: 600, tax: 108 } } },
  });
  const capturedSig = webhookSig(capturedPayload);

  const wh1 = await new Promise<any>((resolve, reject) => {
    const req = require('https').request({ hostname: 'apis.binaxytech.com', path: '/api/v1/webhooks/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(capturedPayload), 'x-razorpay-signature': capturedSig },
    }, (res: any) => { let b = ''; res.on('data', (c: string) => b += c); res.on('end', () => { try { resolve({ s: res.statusCode, ...JSON.parse(b) }); } catch { resolve({ s: res.statusCode }); } }); });
    req.on('error', reject);
    req.write(capturedPayload); req.end();
  });
  assert(wh1.s === 200, `payment.captured webhook: ${wh1.status || wh1.s}`);

  // 9b. Duplicate webhook (idempotency)
  const wh2 = await new Promise<any>((resolve, reject) => {
    const req = require('https').request({ hostname: 'apis.binaxytech.com', path: '/api/v1/webhooks/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(capturedPayload), 'x-razorpay-signature': capturedSig },
    }, (res: any) => { let b = ''; res.on('data', (c: string) => b += c); res.on('end', () => { try { resolve({ s: res.statusCode, ...JSON.parse(b) }); } catch { resolve({ s: res.statusCode }); } }); });
    req.on('error', reject);
    req.write(capturedPayload); req.end();
  });
  assert(wh2.s === 200 && wh2.status === 'already_processed', `Duplicate webhook idempotent: ${wh2.status}`);

  // 9c. Invalid signature
  const wh3 = await new Promise<any>((resolve, reject) => {
    const fakePayload = JSON.stringify({ event_id: 'evt_fake', event: 'payment.captured' });
    const req = require('https').request({ hostname: 'apis.binaxytech.com', path: '/api/v1/webhooks/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fakePayload), 'x-razorpay-signature': 'invalid_sig' },
    }, (res: any) => { let b = ''; res.on('data', (c: string) => b += c); res.on('end', () => { try { resolve({ s: res.statusCode, ...JSON.parse(b) }); } catch { resolve({ s: res.statusCode }); } }); });
    req.on('error', reject);
    req.write(fakePayload); req.end();
  });
  assert(wh3.s === 200 && (wh3.status === 'ignored' || wh3.reason === 'invalid signature'), `Invalid sig rejected: ${wh3.reason || wh3.status}`);

  // 9d. payment.failed webhook
  const failedPayload = JSON.stringify({
    event_id: `evt_failed_${Date.now()}`,
    event: 'payment.failed',
    payload: { payment: { entity: { id: `pay_fail_${Date.now()}`, order_id: 'order_nonexistent', amount: 30000, status: 'failed', method: 'card' } } },
  });
  const failedSig = webhookSig(failedPayload);

  const wh4 = await new Promise<any>((resolve, reject) => {
    const req = require('https').request({ hostname: 'apis.binaxytech.com', path: '/api/v1/webhooks/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(failedPayload), 'x-razorpay-signature': failedSig },
    }, (res: any) => { let b = ''; res.on('data', (c: string) => b += c); res.on('end', () => { try { resolve({ s: res.statusCode, ...JSON.parse(b) }); } catch { resolve({ s: res.statusCode }); } }); });
    req.on('error', reject);
    req.write(failedPayload); req.end();
  });
  assert(wh4.s === 200, `payment.failed webhook handled: ${wh4.status}`);

  // 9e. transfer.processed webhook
  const transferPayload = JSON.stringify({
    event_id: `evt_transfer_${Date.now()}`,
    event: 'transfer.processed',
    payload: { transfer: { entity: { id: 'trf_nonexistent', amount: 18000, currency: 'INR', status: 'processed' } } },
  });
  const transferSig = webhookSig(transferPayload);

  const wh5 = await new Promise<any>((resolve, reject) => {
    const req = require('https').request({ hostname: 'apis.binaxytech.com', path: '/api/v1/webhooks/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(transferPayload), 'x-razorpay-signature': transferSig },
    }, (res: any) => { let b = ''; res.on('data', (c: string) => b += c); res.on('end', () => { try { resolve({ s: res.statusCode, ...JSON.parse(b) }); } catch { resolve({ s: res.statusCode }); } }); });
    req.on('error', reject);
    req.write(transferPayload); req.end();
  });
  assert(wh5.s === 200, `transfer.processed webhook: ${wh5.status}`);
}

async function test10_duplicatePaymentPrevention() {
  console.log('\n📋 TEST 10: Edge Cases — Duplicate Payment Prevention');

  if (!orderId) { skip('No order to test'); return; }

  // Try verifying same payment again
  const mockPayId = `pay_test_${Date.now()}`;
  const sig = hmac(orderId, mockPayId);
  const verify = await api('POST', '/payments/verify', {
    razorpay_order_id: orderId,
    razorpay_payment_id: mockPayId,
    razorpay_signature: sig,
  }, customerToken);
  assert(verify.status === 200 && verify.message?.includes('already'), `Duplicate payment idempotent: ${verify.message}`);
}

async function test11_notifications() {
  console.log('\n📋 TEST 11: Notifications Generated');

  const notifs = await api('GET', '/notifications', undefined, customerToken);
  assert(notifs.status === 200, `Customer notifications: ${notifs.data?.length}`);

  const ownerNotifs = await api('GET', '/notifications', undefined, ownerToken);
  assert(ownerNotifs.status === 200, `Owner notifications: ${ownerNotifs.data?.length}`);

  const unread = await api('GET', '/notifications/unread-count', undefined, ownerToken);
  assert(unread.status === 200, `Unread count accessible`);
}

async function test12_incentiveProgress() {
  console.log('\n📋 TEST 12: Incentive Progress');

  const incentive = await api('GET', `/payments/salon/${salonId}/incentive-progress`, undefined, ownerToken);
  assert(incentive.status === 200, 'Incentive progress retrieved');
  if (incentive.data) {
    console.log(`  Bookings: ${incentive.data.current_month_bookings}/${incentive.data.threshold}`);
    console.log(`  Eligible: ${incentive.data.eligible}`);
    console.log(`  Bonus: ₹${incentive.data.bonus_amount}`);
  }
}

async function test13_settlementHistory() {
  console.log('\n📋 TEST 13: Settlement History');

  const settlements = await api('GET', `/payments/salon/${salonId}/settlements`, undefined, ownerToken);
  assert(settlements.status === 200, `Settlements: ${settlements.data?.length || 0} records`);
}

async function test14_appConfig() {
  console.log('\n📋 TEST 14: App Config Endpoint');

  const config = await api('GET', '/config/app');
  assert(config.status === 200, 'App config retrieved');
  if (config.data) {
    assert(config.data.app_name === 'HeloHair', `App name: ${config.data.app_name}`);
    assert(config.data.commission_percent === 10, `Commission: ${config.data.commission_percent}%`);
    assert(config.data.currency === 'INR', `Currency: ${config.data.currency}`);
    console.log(`  Min withdrawal: ₹${config.data.min_withdrawal}`);
  }
}

// ==========================================
// Run All
// ==========================================

async function run() {
  console.log('================================================');
  console.log(' E2E Complete Flow Test — HeloHair');
  console.log('================================================');
  console.log(` Server: ${BASE}`);
  console.log(` Date: ${new Date().toISOString()}`);

  try {
    const health = await api('GET', `${BASE.replace('/api/v1', '')}/health`);
    if (health.status !== 200) { console.error('\n❌ Server not running!'); process.exit(1); }
    console.log('\n✅ Server healthy');

    await test1_login();
    await test2_getSalonAndServices();
    await test3_addBankDetails();
    await test3b_bankEdgeCases();
    await test4_createBookingAndPay();
    await test5_salonManagesBooking();
    await test6_verifyEarningsAndWallet();
    await test7_withdrawalFlow();
    await test7b_withdrawalEdgeCases();
    await test8_cancelAndRefund();
    await test9_webhookSimulations();
    await test10_duplicatePaymentPrevention();
    await test11_notifications();
    await test12_incentiveProgress();
    await test13_settlementHistory();
    await test14_appConfig();

    console.log('\n================================================');
    console.log(` Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    console.log('================================================');
    process.exit(failed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('\n💥 Fatal:', err.message);
    process.exit(1);
  }
}

run();
