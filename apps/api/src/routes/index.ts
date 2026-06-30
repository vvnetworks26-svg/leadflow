import { Router } from 'express';
import healthRoutes       from './health.routes';
import authRoutes         from './auth.routes';
import leadRoutes         from './lead.routes';
import appointmentRoutes  from './appointment.routes';
import conversationRoutes from './conversation.routes';
import businessRoutes     from './business.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/health',        healthRoutes);
router.use('/auth',          authRoutes);
router.use('/leads',         leadRoutes);
router.use('/appointments',  appointmentRoutes);
router.use('/conversations', conversationRoutes);
router.use('/business',      businessRoutes);
router.use('/notifications', notificationRoutes);

export default router;
