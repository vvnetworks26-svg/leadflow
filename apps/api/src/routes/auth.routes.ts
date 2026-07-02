import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, logout, refresh, me } from '../controllers/authController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../utils/validate';
import { RegisterSchema, LoginSchema, LogoutSchema } from '../dto/auth.dto';

const router = Router();

/** Strict rate limit for credential endpoints — 10 attempts per 15 min per IP. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many attempts, please try again later.' },
});

/** Slightly looser limit for the refresh endpoint — 30 attempts per 15 min per IP. */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many attempts, please try again later.' },
});

router.post('/register', authLimiter,    validate(RegisterSchema), register);
router.post('/login',    authLimiter,    validate(LoginSchema),    login);
router.post('/logout',   refreshLimiter, validate(LogoutSchema), logout);
router.post('/refresh',  refreshLimiter, refresh);
router.get('/me',        authenticate,  me);

export default router;
