import { Router } from 'express';
import { get, upsert } from '../controllers/businessController';
import { authenticate, authorize } from '../middleware/authenticate';
import { OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';

const router = Router();
router.use(authenticate);

// Read — owner, admin
router.get('/', authorize(...OWNER_ADMIN), get);

// Update — owner only
router.put('/',   authorize(...OWNER_ONLY), upsert);
router.patch('/', authorize(...OWNER_ONLY), upsert);

export default router;
