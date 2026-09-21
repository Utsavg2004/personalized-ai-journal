import { supabaseAdmin } from '../config/supabase.js';
import { UpstreamServiceError } from '../utils/errors.js';

const CONVERSATIONS_TABLE = 'conversations';
const MESSAGES_TABLE = 'messages';

const assertNoError = (error, action) => {
  if (error) {
    throw new UpstreamServiceError('Database', `${action} failed: ${error.message}`);
  }
};

/**
 * Creates a new conversation row for an authenticated user. The database
 * generates the real id (conversations.id DEFAULT gen_random_uuid()) --
 * callers must never invent or mock one themselves.
 */
export const insertConversation = async ({ userId, title = '' }) => {
  const { data, error } = await supabaseAdmin
    .from(CONVERSATIONS_TABLE)
    .insert([{ user_id: userId, title }])
    .select();

  assertNoError(error, 'Insert conversation');
  return data?.[0] ?? null;
};

/**
 * Selects a conversation strictly scoped to the authenticated user, mirroring
 * journal.repository.js's defense-in-depth pattern: ownership is enforced in
 * the query itself (both `id` and `user_id`), not by fetching unscoped and
 * comparing afterwards, so a row belonging to another user can never be
 * returned from here.
 */
export const selectConversationForUser = async ({ userId, id }) => {
  const { data, error } = await supabaseAdmin
    .from(CONVERSATIONS_TABLE)
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', userId);

  assertNoError(error, 'Select conversation by id');
  return data?.[0] ?? null;
};

/** Persists one or more chat turns (user/assistant) for a conversation. */
export const insertMessages = async (rows) => {
  const payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
    conversation_id: row.conversationId,
    user_id: row.userId,
    role: row.role,
    content: row.content,
    sources: row.sources ?? [],
  }));

  const { data, error } = await supabaseAdmin.from(MESSAGES_TABLE).insert(payload).select();

  assertNoError(error, 'Insert messages');
  return data;
};
