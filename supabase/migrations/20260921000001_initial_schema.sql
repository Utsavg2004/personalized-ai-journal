-- ============================================================
-- Supabase / pgvector Schema Migration
-- Personalized AI Journal — RAG MVP
-- ============================================================
-- This migration creates:
--   1. The `journals` table (user journal entries).
--   2. The `journal_chunks` table (chunked + embedded journal text).
--   3. The `conversations` table (optional chat history).
--   4. Row-Level Security (RLS) policies on all tables.
--   5. The `match_journal_chunks` RPC function for vector similarity search.
--
-- SECURITY MODEL:
--   RLS is enabled on every table. Policies enforce that the authenticated
--   user (auth.uid()) can only read/write their own rows. The backend uses
--   the service-role key (which bypasses RLS) but ALSO explicitly scopes
--   every query by user_id in application code as a defense-in-depth layer.
--   If someone were to accidentally expose the anon key or a JWT directly
--   to the client, RLS is the last line of defense.
-- ============================================================

-- 0. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. journals
-- ============================================================
CREATE TABLE IF NOT EXISTS journals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '',
  content     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journals_user_id ON journals(user_id);

ALTER TABLE journals ENABLE ROW LEVEL SECURITY;

CREATE POLICY journals_select_own ON journals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY journals_insert_own ON journals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY journals_update_own ON journals
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY journals_delete_own ON journals
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 2. journal_chunks (vector store)
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id  uuid NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  chunk_text  text NOT NULL,
  embedding   vector(768),
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_chunks_user_id ON journal_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_chunks_journal_id ON journal_chunks(journal_id);

-- IVFFlat index for fast approximate nearest-neighbor search.
-- The number of lists should be tuned based on expected row count;
-- 100 is a reasonable starting point for up to ~100k rows.
CREATE INDEX IF NOT EXISTS idx_journal_chunks_embedding ON journal_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE journal_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chunks_select_own ON journal_chunks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY chunks_insert_own ON journal_chunks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY chunks_delete_own ON journal_chunks
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. conversations (optional chat history)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select_own ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY conversations_insert_own ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY conversations_delete_own ON conversations
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. match_journal_chunks — tenant-scoped vector similarity RPC
-- ============================================================
-- SECURITY: The `match_user_id` parameter is MANDATORY and is always
-- passed from server-side code (never from client input). This function
-- itself acts as a defense-in-depth layer: even if called via the
-- service-role client (which bypasses RLS), the WHERE clause ensures
-- only the specified user's chunks are ever returned.
-- ============================================================
CREATE OR REPLACE FUNCTION match_journal_chunks(
  query_embedding  vector(768),
  match_user_id    uuid,
  match_count      integer DEFAULT 5,
  match_threshold  float DEFAULT 0.0
)
RETURNS TABLE (
  id          uuid,
  journal_id  uuid,
  chunk_index integer,
  chunk_text  text,
  metadata    jsonb,
  similarity  float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    jc.id,
    jc.journal_id,
    jc.chunk_index,
    jc.chunk_text,
    jc.metadata,
    (1 - (jc.embedding <=> query_embedding))::float AS similarity
  FROM journal_chunks jc
  WHERE jc.user_id = match_user_id
    AND (1 - (jc.embedding <=> query_embedding)) >= match_threshold
  ORDER BY jc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
