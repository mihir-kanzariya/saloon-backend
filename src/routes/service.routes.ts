import { Router } from 'express';
import { ServiceController } from '../controllers/service.controller';
import { authenticate, authorizeSalonMember } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createServiceValidation, updateServiceValidation } from '../validators/service.validator';

const router = Router();

router.get('/categories', ServiceController.getCategories);
router.get('/salon/:salonId', ServiceController.getBySalon);
router.post('/', authenticate, validate(createServiceValidation), ServiceController.create);
router.put('/:serviceId', authenticate, validate(updateServiceValidation), ServiceController.update);
router.delete('/:serviceId', authenticate, ServiceController.delete);

export default router;
