import { Router } from 'express';
import { list, getById, create, update, cancel } from '../controllers/appointmentController';
import { authenticate, authorize } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../dto/appointment.dto';
import { ALL_ROLES, OWNER_ADMIN } from '../config/permissions';

const router = Router();
router.use(authenticate);

// Read — owner, admin, technician
router.get('/',    authorize(...ALL_ROLES),   list);
router.get('/:id', authorize(...ALL_ROLES),   getById);

// Create / Update / Cancel — owner, admin
router.post('/',           authorize(...OWNER_ADMIN), validate(CreateAppointmentSchema), create);
router.patch('/:id',       authorize(...OWNER_ADMIN), validate(UpdateAppointmentSchema), update);
router.post('/:id/cancel', authorize(...OWNER_ADMIN), cancel);

export default router;
