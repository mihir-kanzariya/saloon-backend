import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { UtilsController } from '../controllers/utils.controller';

const router = Router();

router.get('/ifsc/:code', authenticate, UtilsController.lookupIFSC);

export default router;
