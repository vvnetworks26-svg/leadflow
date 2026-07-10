import { Router } from 'express';
import { list, create, markRead, markAllRead, remove } from '../controllers/notificationController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateNotificationSchema } from '../dto/notification.dto';
import { ALL_ROLES, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// Read — all roles
router.get('/', authorize(...ALL_ROLES), list);

// Create — owner, admin
router.post('/', authorize(...OWNER_ADMIN), validate(CreateNotificationSchema), create);

// Mark read — all roles
router.patch('/read-all', authorize(...ALL_ROLES), markAllRead);
router.patch('/:id/read', authorize(...ALL_ROLES), markRead);

// Delete — owner only
router.delete('/:id', authorize(...OWNER_ONLY), remove);

export default router;
