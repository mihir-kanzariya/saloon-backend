import { Router } from 'express';
import { OnboardingController } from '../controllers/onboarding.controller';
import { authenticate, authorizeSalonMember } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createLinkedAccountValidator, updateLinkedAccountValidator } from '../validators/onboarding.validator';

const router = Router();

// POST /salons/:salonId/onboarding/linked-account — Create linked account (owner only)
router.post(
  '/:salonId/onboarding/linked-account',
  authenticate,
  authorizeSalonMember('owner'),
  validate(createLinkedAccountValidator),
  OnboardingController.createLinkedAccount
);

// GET /salons/:salonId/onboarding/linked-account — Get status (owner/manager)
router.get(
  '/:salonId/onboarding/linked-account',
  authenticate,
  authorizeSalonMember('owner', 'manager'),
  OnboardingController.getLinkedAccount
);

// PUT /salons/:salonId/onboarding/linked-account — Update bank/contact (owner only)
router.put(
  '/:salonId/onboarding/linked-account',
  authenticate,
  authorizeSalonMember('owner'),
  validate(updateLinkedAccountValidator),
  OnboardingController.updateLinkedAccount
);

// POST /salons/:salonId/onboarding/linked-account/refresh — Refresh KYC status (owner/manager)
router.post(
  '/:salonId/onboarding/linked-account/refresh',
  authenticate,
  authorizeSalonMember('owner', 'manager'),
  OnboardingController.refreshKycStatus
);

export default router;
