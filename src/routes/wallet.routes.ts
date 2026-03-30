import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate, authorizeSalonMember } from '../middleware/auth';

const router = Router();

router.get('/salon/:salonId/summary', authenticate, authorizeSalonMember('owner', 'manager'), WalletController.getSummary);
router.get('/salon/:salonId/ledger', authenticate, authorizeSalonMember('owner', 'manager'), WalletController.getLedger);
router.post('/salon/:salonId/withdraw', authenticate, authorizeSalonMember('owner'), WalletController.requestWithdrawal);
router.get('/salon/:salonId/withdrawals', authenticate, authorizeSalonMember('owner', 'manager'), WalletController.getWithdrawals);

export default router;
