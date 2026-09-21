import rateLimit from 'express-rate-limit';

/**
 * Rate limiters for endpoints that invoke expensive external services
 * (LLM, embedding) or are common brute-force targets (auth).
 *
 * These are intentionally separated so that a burst of chat requests
 * doesn't affect health-check or journal CRUD availability.
 */

/** Chat endpoint: 20 requests per minute per IP. */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many chat requests. Please wait a moment and try again.',
    },
  },
});

/** Auth endpoints: 10 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});
