import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/leadController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateLeadSchema, UpdateLeadSchema } from '../dto/lead.dto';

const router = Router();
router.use(authenticate);

router.get('/',          list);
router.get('/:id',       getById);
router.post('/',         validate(CreateLeadSchema), create);
router.patch('/:id',     validate(UpdateLeadSchema), update);
router.delete('/:id',    remove);

export default router;
