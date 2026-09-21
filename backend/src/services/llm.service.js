import { env } from '../config/env.js';
import { createLLMProvider } from './llmProviders/index.js';
import { AppError, LLMError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * LLMService: the single entry point for generating a language-model
 * completion. This is the contract every caller -- RAGService, and any
 * future consumer -- must go through; nothing outside llmProviders/ may
 * call OpenRouter or Ollama's HTTP APIs directly. See llmProviders/ for the
 * per-provider request shape and llmProviders/index.js (LLMFactory) for how
 * LLM_PROVIDER selects one.
 *
 * Contract every provider must implement:
 *
 *   generateCompletion({ messages, temperature?, maxTokens?, timeoutMs? })
 *     -> Promise<{ content: string, model: string, finishReason: string | null }>
 *
 *   messages: [{ role: 'system' | 'user' | 'assistant', content: string }]
 *
 * Switching providers (LLM_PROVIDER=openrouter | ollama) is a configuration
 * change only -- LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_NAME select and
 * configure it, and no caller of this module needs to change.
 */
let cachedProvider = null;

const getProvider = () => {
  if (!cachedProvider) {
    cachedProvider = createLLMProvider({
      provider: env.LLM_PROVIDER,
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL_NAME,
    });
  }
  return cachedProvider;
};

/**
 * Generates one chat completion. Never logs `messages` -- in a RAG flow
 * these carry retrieved journal content -- only the outcome (success/failure,
 * never content) is logged.
 */
export const generateCompletion = async ({ messages, temperature, maxTokens, timeoutMs } = {}) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new LLMError('generateCompletion requires a non-empty messages array');
  }

  try {
    return await getProvider().generateCompletion({ messages, temperature, maxTokens, timeoutMs });
  } catch (err) {
    // Log the failure's shape only -- code/statusCode, never `err` fields
    // that could carry request details (messages content, headers, keys).
    logger.error('LLM completion failed', err);
    // Known operational errors (LLMError, RateLimitError, ...) already carry
    // the right statusCode/code -- pass them through as-is. Only an
    // unrecognized/unexpected error gets flattened into a generic LLMError.
    throw err instanceof AppError ? err : new LLMError(err.message);
  }
};
