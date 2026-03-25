import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendMessageValidator } from '../validators/chat.validator';

const router = Router();

router.get('/rooms', authenticate, ChatController.getRooms);
router.get('/rooms/:roomId/messages', authenticate, ChatController.getMessages);
router.post('/rooms/:roomId/messages', authenticate, validate(sendMessageValidator), ChatController.sendMessage);
router.post('/rooms/:roomId/mark-read', authenticate, ChatController.markAsRead);
router.post('/rooms/:roomId/typing', authenticate, ChatController.sendTyping);
router.put('/rooms/:roomId/close', authenticate, ChatController.closeRoom);

export default router;
