import { EmbeddingError } from '../../utils/errors.js';

const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;

/**
 * OpenAI-compatible embeddings endpoint (`POST {baseUrl}/embeddings`).
 * Used for both the `openai` and `openrouter` EMBEDDING_PROVIDER values,
 * since both expose this same request/response shape.
 */
export const createOpenAICompatibleProvider = ({ baseUrl, apiKey, model }) => ({
  embedBatch: async (texts) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_EMBEDDING_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new EmbeddingError(`Embedding provider request timed out after ${DEFAULT_EMBEDDING_TIMEOUT_MS}ms`);
      }
      throw new EmbeddingError(`Embedding provider request failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new EmbeddingError(`Embedding provider responded with HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (!payload || !Array.isArray(payload.data)) {
      throw new EmbeddingError('Embedding provider returned a malformed response');
    }

    return [...payload.data]
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.embedding);
  },
});
