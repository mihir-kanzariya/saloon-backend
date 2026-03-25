import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, NotificationController.getAll);
router.get('/unread-count', authenticate, NotificationController.getUnreadCount);
router.put('/:notificationId/read', authenticate, NotificationController.markAsRead);
router.put('/read-all', authenticate, NotificationController.markAllAsRead);

export default router;
