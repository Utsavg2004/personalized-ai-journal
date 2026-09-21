import { EmbeddingError } from '../../utils/errors.js';

/**
 * Ollama's `/api/embeddings` endpoint accepts one prompt per request (no
 * batch input), so a batch of chunks is embedded sequentially. Chunk counts
 * per journal are small (see utils/chunkText.js), so this is not a
 * meaningful throughput concern.
 */
export const createOllamaProvider = ({ baseUrl, model }) => ({
  embedBatch: async (texts) => {
    const vectors = [];

    for (const text of texts) {
      let response;
      try {
        // eslint-disable-next-line no-await-in-loop -- sequential by design, see comment above
        response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
        });
      } catch (err) {
        throw new EmbeddingError(`Embedding provider request failed: ${err.message}`);
      }

      if (!response.ok) {
        throw new EmbeddingError(`Embedding provider responded with HTTP ${response.status}`);
      }

      // eslint-disable-next-line no-await-in-loop
      const payload = await response.json().catch(() => null);
      if (!payload || !Array.isArray(payload.embedding)) {
        throw new EmbeddingError('Embedding provider returned a malformed response');
      }

      vectors.push(payload.embedding);
    }

    return vectors;
  },
});
