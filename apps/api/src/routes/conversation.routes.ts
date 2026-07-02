import { Router } from 'express';
import { list, getById, create, update, addMessage } from '../controllers/conversationController';
import { authenticate, authorize } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateConversationSchema, UpdateConversationSchema, AddMessageSchema } from '../dto/conversation.dto';
import { ALL_ROLES, OWNER_ADMIN } from '../config/permissions';

const router = Router();
router.use(authenticate);

// Read — owner, admin, technician
router.get('/',    authorize(...ALL_ROLES),   list);
router.get('/:id', authorize(...ALL_ROLES),   getById);

// Create / Update / Send messages — owner, admin
router.post('/',              authorize(...OWNER_ADMIN), validate(CreateConversationSchema), create);
router.patch('/:id',          authorize(...OWNER_ADMIN), validate(UpdateConversationSchema), update);
router.post('/:id/messages',  authorize(...OWNER_ADMIN), validate(AddMessageSchema), addMessage);

export default router;
