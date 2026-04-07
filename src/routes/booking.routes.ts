import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BookingController } from '../controllers/booking.controller';
import { authenticate, authorizeSalonMember } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createBookingValidation, updateBookingStatusValidation, bookingIdValidation } from '../validators/booking.validator';

const router = Router();

// Rate limit only booking creation (not reads/status updates)
const bookingCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many booking requests, please try again later' },
});

// Customer
router.post('/', authenticate, bookingCreateLimiter, validate(createBookingValidation), BookingController.create);
router.post('/pay-and-book', authenticate, bookingCreateLimiter, validate(createBookingValidation), BookingController.createWithPayment);
router.get('/my', authenticate, BookingController.getMyBookings);
router.get('/:bookingId', authenticate, validate(bookingIdValidation), BookingController.getById);
router.post('/:bookingId/cancel', authenticate, BookingController.cancel);

// Salon
router.get('/salon/:salonId', authenticate, authorizeSalonMember('owner', 'manager', 'receptionist', 'stylist'), BookingController.getSalonBookings);
router.get('/salon/:salonId/slots', BookingController.getAvailableSlots);
router.get('/salon/:salonId/smart-slots', BookingController.getSmartSlots);
router.put('/:bookingId/status', authenticate, validate(updateBookingStatusValidation), BookingController.updateStatus);
router.post('/:bookingId/collect-payment', authenticate, BookingController.collectPayment);
router.post('/:bookingId/notify-customer', authenticate, BookingController.notifyCustomer);

export default router;
