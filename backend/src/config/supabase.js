import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  // Graceful fallback for mock tests that don't need real DB connection
  // but do need the module to resolve
}

/**
 * Service role client for privileged operations (e.g. vector search across
 * the tenant's data when triggered by the backend).
 */
export const supabaseAdmin = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;
