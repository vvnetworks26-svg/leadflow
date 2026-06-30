import { Router } from 'express';
import { get, upsert } from '../controllers/businessController';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/',   get);
router.put('/',   upsert);
router.patch('/', upsert);

export default router;
