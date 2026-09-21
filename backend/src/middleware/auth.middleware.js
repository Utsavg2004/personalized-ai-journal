import { supabaseAdmin } from '../config/supabase.js';
import { UnauthorizedError } from '../utils/errors.js';
import { env } from '../config/env.js';

/**
 * Express middleware to enforce authentication.
 * Expects `Authorization: Bearer <token>`.
 * Validates the token with Supabase and attaches the user to `req.user`.
 *
 * SECURITY NOTE: The test-mode bypass only activates when NODE_ENV === 'test'
 * AND supabaseAdmin is null. In production, supabaseAdmin must always be
 * configured, so this path is unreachable.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];

    if (!supabaseAdmin) {
      // Test-mode fallback: only allowed when NODE_ENV is explicitly 'test'.
      // In production, a missing supabaseAdmin is a configuration error, not
      // a reason to weaken auth.
      if (env.NODE_ENV === 'test' && (token.startsWith('mock_at_') || token === 'test')) {
        req.user = { id: 'test-user-id' };
        return next();
      }
      throw new UnauthorizedError('Authentication service not configured');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    req.user = data.user;
    next();
  } catch (err) {
    next(err);
  }
};
