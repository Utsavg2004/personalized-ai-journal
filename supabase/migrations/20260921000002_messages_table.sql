-- ============================================================
-- Supabase / pgvector Schema Migration
-- Personalized AI Journal — Conversation Messages
-- ============================================================
-- Adds the `messages` table: individual turns (user question / assistant
-- answer) belonging to a `conversations` thread. `conversation.service.js`
-- already validates conversation ownership against the `conversations`
-- table created in 20260921000001_initial_schema.sql; this table is the
-- persistence target for the user/assistant turns described there.
--
-- SECURITY MODEL: same defense-in-depth pattern as the rest of the schema
-- (see 20260921000001_initial_schema.sql) -- RLS enforces auth.uid() =
-- user_id, and any backend query against this table using the service-role
-- client must still explicitly filter by user_id.
-- ============================================================

-- Supabase projects normally have pgcrypto enabled already; declared here
-- defensively since gen_random_uuid() depends on it.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  sources         jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select_own ON messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY messages_insert_own ON messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY messages_delete_own ON messages
  FOR DELETE USING (auth.uid() = user_id);
