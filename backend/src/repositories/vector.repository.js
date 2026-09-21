import { supabaseAdmin } from '../config/supabase.js';
import { UpstreamServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const TABLE = 'journal_chunks';
const SEARCH_FN = 'match_journal_chunks';

const assertNoError = (error, action) => {
  if (error) {
    throw new UpstreamServiceError('Database', `${action} failed: ${error.message}`);
  }
};

/**
 * All access to the `journal_chunks` vector store goes through this
 * repository. As with journal.repository.js, these queries run under the
 * service-role client (RLS bypassed) and MUST explicitly scope by
 * `user_id`, since RLS is not there to catch a missing filter. This is most
 * critical in `searchSimilar`: an unscoped similarity query (`select ...
 * order by embedding <-> query` with no `user_id` filter) would rank and
 * return every tenant's chunks against the caller's query embedding. This
 * file must never grow a second search path that does that -- `searchSimilar`
 * below, via the `match_journal_chunks` RPC's `match_user_id` parameter, is
 * the only one.
 */

/** Persists one or more chunk embeddings for a journal. */
export const storeEmbedding = async (chunks) => {
  const rows = (Array.isArray(chunks) ? chunks : [chunks]).map((chunk) => ({
    journal_id: chunk.journalId,
    user_id: chunk.userId,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText,
    embedding: chunk.embedding,
    metadata: chunk.metadata ?? {},
  }));

  const { data, error } = await supabaseAdmin.from(TABLE).insert(rows).select();

  assertNoError(error, 'Store embedding');
  return data;
};

/** Deletes every stored chunk embedding belonging to one journal. */
export const deleteJournalEmbeddings = async ({ userId, journalId }) => {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('journal_id', journalId)
    .eq('user_id', userId);

  assertNoError(error, 'Delete journal embeddings');
};

/**
 * Cosine-similarity search over `journal_chunks`, always scoped to
 * `authenticatedUserId` via the `match_journal_chunks` RPC's
 * `match_user_id` argument (see
 * supabase/migrations/20260921120007_match_journal_chunks_function.sql).
 * The RPC's own `where user_id = match_user_id` clause is what prevents
 * cross-tenant results when called via the service-role client (RLS
 * bypassed) -- `authenticatedUserId` must always be derived from a verified
 * session, never client input, and is required here: this function refuses
 * to run rather than silently perform an unscoped search.
 */
export const searchSimilar = async ({
  queryEmbedding,
  authenticatedUserId,
  topK = 5,
  similarityThreshold = 0,
}) => {
  if (!authenticatedUserId) {
    throw new Error('searchSimilar requires authenticatedUserId -- refusing an unscoped vector search');
  }

  logger.rag('vector_search_started', { topK, similarityThreshold });
  logger.rag('authenticated_user', { userId: authenticatedUserId });

  const { data, error } = await supabaseAdmin.rpc(SEARCH_FN, {
    query_embedding: queryEmbedding,
    match_user_id: authenticatedUserId,
    match_count: topK,
    match_threshold: similarityThreshold,
  });

  assertNoError(error, 'Vector similarity search');

  const results = (data ?? []).map((row) => ({
    id: row.id,
    journalId: row.journal_id,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    metadata: row.metadata,
    similarity: row.similarity,
  }));

  // Counts and IDs only -- chunk_text is raw journal content and must never
  // be logged.
  logger.rag('retrieved_chunks', { count: results.length });
  logger.rag('source_ids', { journalChunkIds: results.map((r) => r.id) });

  return results;
};
