import { LLMError } from '../../utils/errors.js';
import { fetchWithTimeout, DEFAULT_TIMEOUT_MS } from './timeoutFetch.js';

/**
 * Ollama's `/api/chat` endpoint. `stream: false` is required to get back
 * one complete JSON object instead of newline-delimited streamed chunks.
 */
export const createOllamaProvider = ({ baseUrl, model }) => ({
  name: 'ollama',
  generateCompletion: async ({ messages, temperature = 0.7, maxTokens, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature,
            ...(maxTokens ? { num_predict: maxTokens } : {}),
          },
        }),
      },
      timeoutMs
    );

    if (!response.ok) {
      throw new LLMError(`LLM provider responded with HTTP ${response.status}`);
    }

    const payload = await response.json().catch(() => null);
    if (!payload?.message?.content) {
      throw new LLMError('LLM provider returned a malformed response');
    }

    return {
      content: payload.message.content,
      model: payload.model ?? model,
      finishReason: payload.done_reason ?? (payload.done ? 'stop' : null),
    };
  },
});
