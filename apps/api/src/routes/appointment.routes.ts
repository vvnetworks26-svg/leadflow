import { Router } from 'express';
import { list, getById, create, update, cancel } from '../controllers/appointmentController';
import { authenticate, authorize, requireOrganization } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { CreateAppointmentSchema, UpdateAppointmentSchema } from '../dto/appointment.dto';
import { ALL_ROLES, AGENT_AND_ABOVE } from '../config/permissions';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// Read — all roles
router.get('/',    authorize(...ALL_ROLES),       list);
router.get('/:id', authorize(...ALL_ROLES),       getById);

// Create / Update / Cancel — agent and above
router.post('/',           authorize(...AGENT_AND_ABOVE), validate(CreateAppointmentSchema), create);
router.patch('/:id',       authorize(...AGENT_AND_ABOVE), validate(UpdateAppointmentSchema), update);
router.post('/:id/cancel', authorize(...AGENT_AND_ABOVE), cancel);

export default router;
