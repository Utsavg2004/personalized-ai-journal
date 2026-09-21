-- ============================================================
-- Supabase / pgvector Schema Migration
-- Personalized AI Journal — updated_at maintenance triggers
-- ============================================================
-- `journals.updated_at` and `conversations.updated_at` are set on insert
-- (DEFAULT now()) but nothing currently refreshes them on UPDATE --
-- journal.repository.js's `updateJournalForUser` only writes `title`/
-- `content`. This adds a trigger so `updated_at` stays accurate without
-- requiring every writer to remember to set it explicitly.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_journals_updated_at ON journals;
CREATE TRIGGER set_journals_updated_at
  BEFORE UPDATE ON journals
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_conversations_updated_at ON conversations;
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
