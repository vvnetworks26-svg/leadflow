import { Router } from 'express';
import { list, getById, create, update, addMessage } from '../controllers/conversationController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateConversationSchema, UpdateConversationSchema, AddMessageSchema } from '../dto/conversation.dto';

const router = Router();
router.use(authenticate);

router.get('/',                   list);
router.get('/:id',                getById);
router.post('/',                  validate(CreateConversationSchema), create);
router.patch('/:id',              validate(UpdateConversationSchema), update);
router.post('/:id/messages',      validate(AddMessageSchema), addMessage);

export default router;
