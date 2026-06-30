import { Router } from 'express';
import { list, getById, create, update, cancel } from '../controllers/appointmentController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../dto/appointment.dto';

const router = Router();
router.use(authenticate);

router.get('/',              list);
router.get('/:id',           getById);
router.post('/',             validate(CreateAppointmentSchema), create);
router.patch('/:id',         validate(UpdateAppointmentSchema), update);
router.post('/:id/cancel',   cancel);

export default router;
