import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AdminController } from '../controllers/admin.controller';

const router = Router();

// Settlement management
router.post('/settlement/run', authenticate, authorize('admin'), AdminController.triggerSettlement);
router.get('/settlement/batches', authenticate, authorize('admin'), AdminController.getSettlementBatches);
router.get('/settlement/batches/:batchId', authenticate, authorize('admin'), AdminController.getSettlementBatchDetail);

// Payout management
router.post('/payouts', authenticate, authorize('admin'), AdminController.createPayout);
router.get('/payouts', authenticate, authorize('admin'), AdminController.getPayouts);
router.get('/payouts/eligible', authenticate, authorize('admin'), AdminController.getEligibleSalons);

export default router;
