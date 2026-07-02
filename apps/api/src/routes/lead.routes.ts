import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/leadController';
import { authenticate, authorize } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateLeadSchema, UpdateLeadSchema } from '../dto/lead.dto';
import { ALL_ROLES, OWNER_ADMIN, OWNER_ONLY } from '../config/permissions';

const router = Router();
router.use(authenticate);

// Read — owner, admin, technician
router.get('/',      authorize(...ALL_ROLES),   list);
router.get('/:id',   authorize(...ALL_ROLES),   getById);

// Create / Update — owner, admin
router.post('/',     authorize(...OWNER_ADMIN), validate(CreateLeadSchema), create);
router.patch('/:id', authorize(...OWNER_ADMIN), validate(UpdateLeadSchema), update);

// Delete — owner only
router.delete('/:id', authorize(...OWNER_ONLY), remove);

export default router;
