import { Router } from 'express';
import { list, getById, create, update, addMessage } from '../controllers/conversationController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateConversationSchema, UpdateConversationSchema, AddMessageSchema } from '../dto/conversation.dto';
import { ALL_ROLES, AGENT_AND_ABOVE } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// Read — all roles
router.get('/',    authorize(...ALL_ROLES),       list);
router.get('/:id', authorize(...ALL_ROLES),       getById);

// Create / Update / Send messages — agent and above
router.post('/',             authorize(...AGENT_AND_ABOVE), validate(CreateConversationSchema), create);
router.patch('/:id',         authorize(...AGENT_AND_ABOVE), validate(UpdateConversationSchema), update);
router.post('/:id/messages', authorize(...AGENT_AND_ABOVE), validate(AddMessageSchema), addMessage);

export default router;
