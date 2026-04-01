import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { RefundController } from '../controllers/refund.controller';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate, authorizeSalonMember, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createOrderValidator, verifyPaymentValidator, withdrawValidator } from '../validators/payment.validator';

const router = Router();

router.post('/create-order', authenticate, validate(createOrderValidator), PaymentController.createOrder);
router.post('/verify', authenticate, validate(verifyPaymentValidator), PaymentController.verifyPayment);
router.post('/:paymentId/refund', authenticate, RefundController.initiateRefund);
router.get('/salon/:salonId/earnings', authenticate, authorizeSalonMember('owner', 'manager', 'stylist', 'receptionist'), PaymentController.getEarnings);
// Withdrawal routes redirect to WalletController (canonical endpoint is /wallet/salon/:salonId/withdraw)
router.post('/salon/:salonId/withdraw', authenticate, authorizeSalonMember('owner'), validate(withdrawValidator), WalletController.requestWithdrawal);
router.get('/salon/:salonId/withdrawals', authenticate, authorizeSalonMember('owner', 'manager'), WalletController.getWithdrawals);
router.get('/salon/:salonId/incentive-progress', authenticate, authorizeSalonMember('owner', 'manager'), PaymentController.getIncentiveProgress);
router.get('/salon/:salonId/settlements', authenticate, authorizeSalonMember('owner', 'manager'), PaymentController.getSettlements);

export default router;
