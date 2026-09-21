/**
 * Splits journal content into chunks for embedding.
 *
 * A short entry (<= CHUNK_SIZE characters) becomes a single chunk, so the
 * common case (a few sentences) isn't split for no reason. A longer entry is
 * split into CHUNK_SIZE-character windows with CHUNK_OVERLAP characters of
 * overlap between consecutive chunks, so a sentence that straddles a chunk
 * boundary still appears whole in at least one chunk -- this matters for
 * retrieval quality, since a half-sentence chunk embeds poorly. Boundaries
 * are nudged forward to the next whitespace so a chunk never splits a word.
 */
export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 150;

const nextBoundary = (text, idealEnd) => {
  if (idealEnd >= text.length) return text.length;
  const lookahead = text.slice(idealEnd, idealEnd + 80);
  const spaceOffset = lookahead.search(/\s/);
  return spaceOffset === -1 ? idealEnd : idealEnd + spaceOffset;
};

export const chunkText = (content) => {
  const normalized = (content ?? '').trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const end = nextBoundary(normalized, start + CHUNK_SIZE);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    if (end >= normalized.length) break;
    // `end - CHUNK_OVERLAP` can land at or before `start` for a very short
    // lookahead-extended window; the `start + 1` floor guarantees the
    // window always advances so this loop can't spin forever.
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
};
