import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/leadController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateLeadSchema, UpdateLeadSchema } from '../dto/lead.dto';
import { ALL_ROLES, AGENT_AND_ABOVE, OWNER_ADMIN } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// Read — all roles (viewer included)
router.get('/',      authorize(...ALL_ROLES),         list);
router.get('/:id',   authorize(...ALL_ROLES),         getById);

// Create / Update — agent and above
router.post('/',     authorize(...AGENT_AND_ABOVE),   validate(CreateLeadSchema), create);
router.patch('/:id', authorize(...AGENT_AND_ABOVE),   validate(UpdateLeadSchema), update);

// Delete — owner, admin only
router.delete('/:id', authorize(...OWNER_ADMIN), remove);

export default router;
