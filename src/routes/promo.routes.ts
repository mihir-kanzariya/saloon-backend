import { Router } from 'express';
import { PromoController } from '../controllers/promo.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { promoValidateValidator } from '../validators/promo.validator';

const router = Router();

// POST /promo-codes/validate
router.post('/validate', authenticate, validate(promoValidateValidator), PromoController.validate);

export default router;
