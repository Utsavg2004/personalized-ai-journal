import { env } from '../config/env.js';
import { createEmbeddingProvider } from './embeddingProviders/index.js';
import { EmbeddingError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Single entry point for turning text into embedding vectors. Callers
 * (journal.service.js, and later the RAG retrieval path) must go through
 * `embedText`/`embedTexts` here -- never call an embedding provider's HTTP
 * API directly -- so the provider implementation (and its API key) stays
 * swappable in one place. See embeddingProviders/ for the per-provider HTTP
 * request shape; EMBEDDING_PROVIDER/EMBEDDING_BASE_URL/EMBEDDING_API_KEY/
 * EMBEDDING_MODEL (config/env.js) select and configure it.
 */
let cachedProvider = null;

const getProvider = () => {
  if (!cachedProvider) {
    cachedProvider = createEmbeddingProvider({
      provider: env.EMBEDDING_PROVIDER,
      baseUrl: env.EMBEDDING_BASE_URL,
      apiKey: env.EMBEDDING_API_KEY,
      model: env.EMBEDDING_MODEL,
    });
  }
  return cachedProvider;
};

/**
 * Embeds a batch of texts in one call (one HTTP round trip where the
 * provider supports it). Never logs the input text -- it is raw journal
 * content -- only counts and, on failure, the provider's own error shape.
 */
export const embedTexts = async (texts) => {
  if (!Array.isArray(texts) || texts.length === 0) return [];

  try {
    const vectors = await getProvider().embedBatch(texts);

    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new EmbeddingError('Embedding provider returned an unexpected number of vectors');
    }

    return vectors;
  } catch (err) {
    logger.error('Embedding generation failed', err);
    throw err instanceof EmbeddingError ? err : new EmbeddingError(err.message);
  }
};

/** Embeds a single piece of text. Thin convenience wrapper over embedTexts. */
export const embedText = async (text) => {
  const [vector] = await embedTexts([text]);
  return vector;
};
