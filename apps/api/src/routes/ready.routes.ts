import { Router } from 'express';
import { getReady } from '../controllers/readyController';

const router = Router();

router.get('/', getReady);

export default router;
