import { Router } from 'express';
import { StylistController } from '../controllers/stylist.controller';
import { StylistBrowseController } from '../controllers/stylist-browse.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createMemberValidator, updateMemberValidator, assignServicesValidator, setAvailabilityValidator, addBreakValidator, addLeaveValidator } from '../validators/stylist.validator';

const router = Router();

// Browse stylists (must be BEFORE /:memberId routes)
router.get('/nearby', StylistBrowseController.getNearby);

router.post('/', authenticate, validate(createMemberValidator), StylistController.create);
router.put('/:memberId', authenticate, validate(updateMemberValidator), StylistController.update);
router.get('/:memberId/profile', StylistController.getProfile);
router.get('/:memberId/availability', StylistController.getAvailability);
router.put('/:memberId/availability', authenticate, validate(setAvailabilityValidator), StylistController.setAvailability);
router.post('/:memberId/breaks', authenticate, validate(addBreakValidator), StylistController.addBreak);
router.delete('/breaks/:breakId', authenticate, StylistController.removeBreak);
router.post('/:memberId/leaves', authenticate, validate(addLeaveValidator), StylistController.addLeave);
router.delete('/leaves/:leaveId', authenticate, StylistController.removeLeave);
router.put('/:memberId/services', authenticate, validate(assignServicesValidator), StylistController.assignServices);
router.put('/:memberId/services/:serviceId/timing', authenticate, StylistController.updateServiceTiming);
router.get('/:memberId/bookings', authenticate, StylistController.getBookings);

export default router;
