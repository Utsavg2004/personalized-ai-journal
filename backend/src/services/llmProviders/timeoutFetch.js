import { LLMError } from '../../utils/errors.js';

/**
 * Shared transport helper for LLM providers: applies a hard timeout via
 * AbortController and normalizes network/timeout failures into LLMError.
 * This is cross-cutting (every provider needs it identically), so it lives
 * here rather than being duplicated in each provider -- providers only own
 * their own request/response *shape*.
 */
export const DEFAULT_TIMEOUT_MS = 30_000;

export const fetchWithTimeout = async (url, options, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new LLMError(`LLM provider request timed out after ${timeoutMs}ms`);
    }
    throw new LLMError(`LLM provider request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
};
