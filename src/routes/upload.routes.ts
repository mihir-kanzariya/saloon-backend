import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/presigned-url', authenticate, UploadController.getPresignedUrl);
router.get('/read-url', authenticate, UploadController.getReadUrl);
router.get('/file/*key', UploadController.getFile); // No auth — presigned URL is the auth
router.delete('/', authenticate, UploadController.deleteFile);

export default router;
