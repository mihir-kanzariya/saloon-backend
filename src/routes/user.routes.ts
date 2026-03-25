import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateProfileValidation } from '../validators/auth.validator';

const router = Router();

router.get('/me', authenticate, UserController.getProfile);
router.put('/me', authenticate, validate(updateProfileValidation), UserController.updateProfile);
router.put('/me/fcm-token', authenticate, UserController.updateFcmToken);
router.delete('/me', authenticate, UserController.deactivateAccount);

export default router;
