import { Router } from 'express';
import { SalonController } from '../controllers/salon.controller';
import { authenticate, optionalAuth, authorizeSalonMember } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createSalonValidation, updateSalonValidation, salonIdValidation } from '../validators/salon.validator';

const router = Router();

// Static paths FIRST (before :salonId catch-all)
router.get('/nearby', optionalAuth, SalonController.getNearby);
router.get('/user/my-salons', authenticate, SalonController.getMySalons);
router.get('/user/favorites', authenticate, SalonController.getFavorites);
router.delete('/user/favorites/:salonId', authenticate, SalonController.removeFavorite);
router.post('/', authenticate, validate(createSalonValidation), SalonController.create);

// Parameterized routes AFTER static paths
router.get('/:salonId', optionalAuth, validate(salonIdValidation), SalonController.getById);
router.get('/:salonId/stats', authenticate, authorizeSalonMember('owner', 'manager', 'receptionist', 'stylist'), SalonController.getStats);
router.put('/:salonId', authenticate, authorizeSalonMember('owner', 'manager'), validate(updateSalonValidation), SalonController.update);
router.post('/:salonId/favorite', authenticate, SalonController.toggleFavorite);
router.post('/:salonId/search-member', authenticate, authorizeSalonMember('owner', 'manager'), SalonController.searchMember);
router.post('/:salonId/members/invite', authenticate, authorizeSalonMember('owner', 'manager'), SalonController.inviteMember);
router.get('/:salonId/members', authenticate, authorizeSalonMember('owner', 'manager', 'receptionist'), SalonController.getMembers);
router.delete('/:salonId/members/:memberId', authenticate, authorizeSalonMember('owner'), SalonController.removeMember);

// Bank account
router.put('/:salonId/bank-account', authenticate, authorizeSalonMember('owner'), SalonController.updateBankAccount);
router.get('/:salonId/bank-account', authenticate, authorizeSalonMember('owner', 'manager'), SalonController.getBankAccount);

export default router;
