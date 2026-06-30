import { Router } from 'express';
import { list, create, markRead, markAllRead, remove } from '../controllers/notificationController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateNotificationSchema } from '../dto/notification.dto';

const router = Router();
router.use(authenticate);

router.get('/',              list);
router.post('/',             validate(CreateNotificationSchema), create);
router.patch('/read-all',    markAllRead);
router.patch('/:id/read',    markRead);
router.delete('/:id',        remove);

export default router;
