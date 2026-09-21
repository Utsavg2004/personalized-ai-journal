import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';
import {
  registerHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', authLimiter, validateBody(registerSchema), registerHandler);
router.post('/login', authLimiter, validateBody(loginSchema), loginHandler);
router.post('/logout', requireAuth, logoutHandler);
router.get('/me', requireAuth, meHandler);

export default router;
