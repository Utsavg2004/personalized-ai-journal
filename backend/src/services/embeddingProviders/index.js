import { createOpenAICompatibleProvider } from './openAICompatibleProvider.js';
import { createOllamaProvider } from './ollamaProvider.js';

/**
 * Provider factory: the only place that knows which HTTP shape a given
 * EMBEDDING_PROVIDER speaks. Swapping providers, or adding a new one, never
 * touches embedding.service.js or any of its callers -- they only ever see
 * `embedBatch(texts) -> number[][]`.
 */
export const createEmbeddingProvider = ({ provider, baseUrl, apiKey, model }) => {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return createOpenAICompatibleProvider({ baseUrl, apiKey, model });
    case 'ollama':
      return createOllamaProvider({ baseUrl, model });
    default:
      throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
  }
};
