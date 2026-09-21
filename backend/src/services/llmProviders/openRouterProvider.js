import { LLMError, RateLimitError } from '../../utils/errors.js';
import { fetchWithTimeout, DEFAULT_TIMEOUT_MS } from './timeoutFetch.js';

/**
 * OpenRouter's chat completions endpoint is OpenAI-compatible
 * (`POST {baseUrl}/chat/completions`). This is the ONLY place in the app
 * that talks to OpenRouter -- its sole job is translating between the
 * LLMService contract (see llm.service.js) and this HTTP API. `apiKey` is
 * read from `LLM_API_KEY` (config/env.js) and used only in the outgoing
 * `Authorization` header here; it is never logged and never reaches a
 * response sent to a client.
 */
export const createOpenRouterProvider = ({ baseUrl, apiKey, model }) => ({
  name: 'openrouter',
  generateCompletion: async ({ messages, temperature = 0.7, maxTokens, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
      },
      timeoutMs
    );

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new RateLimitError(
        `OpenRouter rate limit exceeded${retryAfter ? ` -- retry after ${retryAfter}s` : ''}`
      );
    }

    if (!response.ok) {
      throw new LLMError(`OpenRouter responded with HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    const choice = payload?.choices?.[0];
    if (!choice?.message?.content) {
      throw new LLMError('OpenRouter returned a malformed response');
    }

    return {
      content: choice.message.content,
      model: payload.model ?? model,
      finishReason: choice.finish_reason ?? null,
    };
  },
});
