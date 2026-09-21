import { EmbeddingError } from '../../utils/errors.js';

/**
 * OpenAI-compatible embeddings endpoint (`POST {baseUrl}/embeddings`).
 * Used for both the `openai` and `openrouter` EMBEDDING_PROVIDER values,
 * since both expose this same request/response shape.
 */
export const createOpenAICompatibleProvider = ({ baseUrl, apiKey, model }) => ({
  embedBatch: async (texts) => {
    let response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });
    } catch (err) {
      throw new EmbeddingError(`Embedding provider request failed: ${err.message}`);
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
