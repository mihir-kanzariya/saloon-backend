import { Router } from 'express';
import { ReviewController } from '../controllers/review.controller';
import { authenticate, authorizeSalonMember } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createReviewValidation, replyReviewValidation, updateReviewValidation } from '../validators/review.validator';

const router = Router();

router.post('/', authenticate, validate(createReviewValidation), ReviewController.create);
router.get('/my', authenticate, ReviewController.getMyReviews);
router.get('/salon/:salonId', ReviewController.getSalonReviews);
router.patch('/:reviewId', authenticate, validate(updateReviewValidation), ReviewController.update);
router.delete('/:reviewId', authenticate, ReviewController.delete);
router.post('/:reviewId/reply', authenticate, validate(replyReviewValidation), ReviewController.reply);

export default router;
