import {
  insertJournal,
  selectJournalsForUser,
  selectJournalByIdForUser,
  updateJournalForUser,
  deleteJournalForUser,
} from '../repositories/journal.repository.js';
import { storeEmbedding, deleteJournalEmbeddings } from '../repositories/vector.repository.js';
import { chunkText } from '../utils/chunkText.js';
import { embedTexts } from './embedding.service.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const toJournalDTO = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// journal -> chunk -> embed -> store. Runs after the journal row exists (a
// chunk's FK needs a real journal_id). If any step here fails, the journal
// is rolled back (best-effort compensating delete, since a service-role
// REST call has no cross-table transaction to rely on) so a journal never
// silently ends up without its embeddings -- it's either fully ingested or
// not created at all.
const ingestJournalChunks = async ({ journalId, userId, title, content }) => {
  const chunks = chunkText(content);
  const vectors = await embedTexts(chunks);

  const rows = chunks.map((chunkContent, index) => ({
    journalId,
    userId,
    chunkIndex: index,
    chunkText: chunkContent,
    embedding: vectors[index],
    metadata: {
      title: title ?? null,
      chunkCount: chunks.length,
    },
  }));

  await storeEmbedding(rows);

  // Never log chunk/journal text -- only shape/counts.
  logger.rag('ingest', { journalId, chunkCount: chunks.length, dimension: vectors[0]?.length ?? 0 });
};

export const createJournal = async ({ userId, title, content }) => {
  const row = await insertJournal({ userId, title, content });
  const journal = toJournalDTO(row);

  try {
    await ingestJournalChunks({ journalId: journal.id, userId, title, content });
  } catch (err) {
    logger.error(`Embedding ingestion failed for journal ${journal.id}, rolling back`, err);

    try {
      // Delete embeddings first, then the journal -- covers the case where
      // some chunks were stored before a later step failed, in addition to
      // the ordinary DB cascade.
      await deleteJournalEmbeddings({ userId, journalId: journal.id });
      await deleteJournalForUser({ userId, id: journal.id });
    } catch (cleanupErr) {
      logger.error(`Failed to roll back journal ${journal.id} after embedding failure`, cleanupErr);
    }

    throw err;
  }

  return journal;
};

export const listJournals = async ({ userId, page, pageSize }) => {
  const offset = (page - 1) * pageSize;
  const { items, total } = await selectJournalsForUser({ userId, offset, limit: pageSize });

  return {
    items: items.map(toJournalDTO),
    total,
  };
};

// A journal that exists but belongs to someone else is reported the same
// way as one that doesn't exist at all (404, not 403) -- this avoids
// confirming to a non-owner that a given id is even a real journal.
export const getJournalById = async ({ userId, id }) => {
  const row = await selectJournalByIdForUser({ userId, id });

  if (!row) {
    throw new NotFoundError('Journal');
  }

  return toJournalDTO(row);
};

export const updateJournal = async ({ userId, id, updates }) => {
  const row = await updateJournalForUser({ userId, id, updates });

  if (!row) {
    throw new NotFoundError('Journal');
  }

  // If content or title changed, re-sync embeddings to prevent stale vectors
  if (updates.content !== undefined || updates.title !== undefined) {
    try {
      await deleteJournalEmbeddings({ userId, journalId: id });
      await ingestJournalChunks({
        journalId: id,
        userId,
        title: row.title,
        content: row.content,
      });
    } catch (err) {
      logger.error(`Failed to re-index embeddings for updated journal ${id}`, err);
    }
  }

  return toJournalDTO(row);
};

export const deleteJournal = async ({ userId, id }) => {
  const row = await deleteJournalForUser({ userId, id });

  if (!row) {
    throw new NotFoundError('Journal');
  }

  // The `journal_chunks.journal_id` FK is `on delete cascade`, so this is
  // belt-and-suspenders rather than the only thing cleaning these up -- but
  // vector store cleanup shouldn't depend solely on that cascade firing.
  await deleteJournalEmbeddings({ userId, journalId: id });
};
