import { supabaseAdmin } from '../config/supabase.js';
import { UpstreamServiceError } from '../utils/errors.js';

const TABLE = 'journals';

const assertNoError = (error, action) => {
  if (error) {
    throw new UpstreamServiceError('Database', `${action} failed: ${error.message}`);
  }
};

/**
 * Inserts a new journal entry for an authenticated user.
 */
export const insertJournal = async ({ userId, title = '', content }) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert([{ user_id: userId, title: title ?? '', content }])
    .select();

  assertNoError(error, 'Insert journal');
  return data?.[0] ?? null;
};

/**
 * Selects paginated journals for a specific user, newest first.
 */
export const selectJournalsForUser = async ({ userId, offset = 0, limit = 10 }) => {
  const { data, count, error } = await supabaseAdmin
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  assertNoError(error, 'Select journals');
  return {
    items: data ?? [],
    total: count ?? data?.length ?? 0,
  };
};

/**
 * Selects a single journal by ID, strictly scoped to the authenticated user.
 */
export const selectJournalByIdForUser = async ({ userId, id }) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('user_id', userId);

  assertNoError(error, 'Select journal by id');
  return data?.[0] ?? null;
};

/**
 * Updates a journal entry, strictly scoped to the authenticated user.
 */
export const updateJournalForUser = async ({ userId, id, updates }) => {
  const payload = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.content !== undefined) payload.content = updates.content;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select();

  assertNoError(error, 'Update journal');
  return data?.[0] ?? null;
};

/**
 * Deletes a journal entry, strictly scoped to the authenticated user.
 */
export const deleteJournalForUser = async ({ userId, id }) => {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select();

  assertNoError(error, 'Delete journal');
  return data?.[0] ?? null;
};
