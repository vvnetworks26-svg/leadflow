import { Router } from 'express';
import { get, upsert } from '../controllers/businessController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { ALL_ROLES, OWNER_ONLY } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// Read — all roles
router.get('/', authorize(...ALL_ROLES), get);

// Update — owner only
router.put('/',   authorize(...OWNER_ONLY), upsert);
router.patch('/', authorize(...OWNER_ONLY), upsert);

export default router;
