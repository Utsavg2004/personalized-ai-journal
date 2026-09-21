import { createOpenRouterProvider } from './openRouterProvider.js';
import { createOllamaProvider } from './ollamaProvider.js';
import { LLMError } from '../../utils/errors.js';

/**
 * LLMFactory: the only place that knows which LLM_PROVIDER values exist and
 * which concrete provider each one maps to. Adding a new provider means
 * adding one file here and one branch below -- llm.service.js (the
 * LLMService) and every caller of it only ever see the shared
 * `generateCompletion()` contract, never a provider directly. Switching
 * providers is therefore a configuration change only (LLM_PROVIDER,
 * LLM_BASE_URL, LLM_API_KEY, LLM_MODEL_NAME).
 */
export const createLLMProvider = ({ provider, baseUrl, apiKey, model }) => {
  let instance;

  switch (provider) {
    case 'openrouter':
      instance = createOpenRouterProvider({ baseUrl, apiKey, model });
      break;
    case 'ollama':
      instance = createOllamaProvider({ baseUrl, model });
      break;
    default:
      // Defense in depth: config/env.js already restricts LLM_PROVIDER to a
      // known enum at startup, but this factory refuses an unrecognized
      // value on its own too, rather than silently returning something
      // unusable.
      throw new LLMError(`Unsupported LLM_PROVIDER: "${provider}"`);
  }

  if (typeof instance.generateCompletion !== 'function') {
    throw new LLMError(`LLM provider "${provider}" does not implement the required generateCompletion() contract`);
  }

  return instance;
};
