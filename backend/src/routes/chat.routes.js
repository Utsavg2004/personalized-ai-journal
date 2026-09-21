import { Router } from 'express';
import { handleChat } from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { chatLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// Chat interactions (RAG MVP)
// Rate-limited → Authenticated → Handled
router.post('/chat', chatLimiter, requireAuth, handleChat);

export default router;
