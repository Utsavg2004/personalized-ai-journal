import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockLLMServer } from './helpers/mockLLMServer.js';
import { createLLMProvider } from '../src/services/llmProviders/index.js';
import { createOpenRouterProvider } from '../src/services/llmProviders/openRouterProvider.js';
import { LLMError, RateLimitError } from '../src/utils/errors.js';

describe('LLMFactory -- provider selection', () => {
  let mockServer;

  before(async () => {
    mockServer = await startMockLLMServer();
  });

  after(async () => {
    await mockServer.close();
  });

  beforeEach(() => {
    mockServer.setFailing(false);
    mockServer.setDelayMs(0);
    mockServer.setMalformed(false);
    mockServer.setRateLimited(false);
  });

  test('LLM_PROVIDER=openrouter selects a provider that speaks the OpenAI-compatible chat/completions shape', async () => {
    const provider = createLLMProvider({
      provider: 'openrouter',
      baseUrl: mockServer.url,
      apiKey: 'test-key',
      model: 'test-model',
    });

    assert.equal(provider.name, 'openrouter');
    assert.equal(typeof provider.generateCompletion, 'function');

    const result = await provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    assert.equal(result.content, 'mock openrouter reply');
    const requestBody = mockServer.getLastRequestBody();
    assert.equal(requestBody.model, 'test-model');
    assert.deepEqual(requestBody.messages, [{ role: 'user', content: 'hi' }]);
  });

  test('LLM_PROVIDER=ollama selects a provider that speaks the Ollama api/chat shape', async () => {
    const provider = createLLMProvider({
      provider: 'ollama',
      baseUrl: mockServer.url,
      apiKey: '',
      model: 'test-model',
    });

    assert.equal(provider.name, 'ollama');
    assert.equal(typeof provider.generateCompletion, 'function');

    const result = await provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    assert.equal(result.content, 'mock ollama reply');
    const requestBody = mockServer.getLastRequestBody();
    assert.equal(requestBody.model, 'test-model');
    assert.equal(requestBody.stream, false);
  });

  test('switching providers is config-only: same factory call shape, different LLM_PROVIDER value', async () => {
    const baseConfig = { baseUrl: mockServer.url, apiKey: 'k', model: 'test-model' };

    const openrouter = createLLMProvider({ ...baseConfig, provider: 'openrouter' });
    const ollama = createLLMProvider({ ...baseConfig, provider: 'ollama' });

    assert.notEqual(openrouter.name, ollama.name);
  });

  test('an unrecognized LLM_PROVIDER value throws a clear LLMError instead of returning something unusable', () => {
    assert.throws(
      () => createLLMProvider({ provider: 'not-a-real-provider', baseUrl: mockServer.url, apiKey: '', model: 'x' }),
      (err) => err instanceof LLMError && /Unsupported LLM_PROVIDER/.test(err.message)
    );
  });

  test('an empty/undefined LLM_PROVIDER also throws rather than defaulting silently', () => {
    assert.throws(() => createLLMProvider({ provider: undefined, baseUrl: mockServer.url, apiKey: '', model: 'x' }), LLMError);
  });
});

describe('LLM providers -- timeout, error handling, upstream failure', () => {
  let mockServer;

  before(async () => {
    mockServer = await startMockLLMServer();
  });

  after(async () => {
    await mockServer.close();
  });

  beforeEach(() => {
    mockServer.setFailing(false);
    mockServer.setDelayMs(0);
    mockServer.setMalformed(false);
    mockServer.setRateLimited(false);
  });

  for (const providerName of ['openrouter', 'ollama']) {
    test(`${providerName}: an HTTP failure from the upstream provider surfaces as an LLMError`, async () => {
      const provider = createLLMProvider({ provider: providerName, baseUrl: mockServer.url, apiKey: 'k', model: 'm' });
      mockServer.setFailing(true);

      await assert.rejects(
        () => provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
        (err) => err instanceof LLMError && /HTTP 500/.test(err.message)
      );
    });

    test(`${providerName}: a malformed response body surfaces as an LLMError`, async () => {
      const provider = createLLMProvider({ provider: providerName, baseUrl: mockServer.url, apiKey: 'k', model: 'm' });
      mockServer.setMalformed(true);

      await assert.rejects(
        () => provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
        (err) => err instanceof LLMError && /malformed/i.test(err.message)
      );
    });

    test(`${providerName}: a slow upstream is aborted at the configured timeout`, async () => {
      const provider = createLLMProvider({ provider: providerName, baseUrl: mockServer.url, apiKey: 'k', model: 'm' });
      mockServer.setDelayMs(200);

      await assert.rejects(
        () => provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }], timeoutMs: 30 }),
        (err) => err instanceof LLMError && /timed out/i.test(err.message)
      );
    });
  }
});

describe('OpenRouterProvider (Phase 8)', () => {
  let mockServer;

  before(async () => {
    mockServer = await startMockLLMServer();
  });

  after(async () => {
    await mockServer.close();
  });

  beforeEach(() => {
    mockServer.setFailing(false);
    mockServer.setDelayMs(0);
    mockServer.setMalformed(false);
    mockServer.setRateLimited(false);
  });

  test('a simple single-turn generation request returns the completion and sends the API key server-side only', async () => {
    const provider = createOpenRouterProvider({ baseUrl: mockServer.url, apiKey: 'sk-secret-test-key', model: 'test-model' });

    const result = await provider.generateCompletion({ messages: [{ role: 'user', content: 'Say hello.' }] });

    assert.equal(result.content, 'mock openrouter reply');
    assert.equal(result.finishReason, 'stop');

    // The key travels only in the outgoing Authorization header to the
    // configured LLM endpoint -- never in the response we hand back.
    const headers = mockServer.getLastRequestHeaders();
    assert.equal(headers.authorization, 'Bearer sk-secret-test-key');
    assert.ok(!JSON.stringify(result).includes('sk-secret-test-key'));
  });

  test('base URL and model are configurable, not hardcoded', async () => {
    const provider = createOpenRouterProvider({ baseUrl: mockServer.url, apiKey: 'k', model: 'openrouter/some-other-model' });
    await provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] });

    assert.equal(mockServer.getLastRequestBody().model, 'openrouter/some-other-model');
  });

  test('an HTTP 429 is surfaced as a distinct RateLimitError, not a generic LLMError', async () => {
    const provider = createOpenRouterProvider({ baseUrl: mockServer.url, apiKey: 'k', model: 'm' });
    mockServer.setRateLimited(true, 20);

    await assert.rejects(
      () => provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      (err) => err instanceof RateLimitError && err.statusCode === 429 && err.code === 'RATE_LIMIT_EXCEEDED' && /retry after 20s/.test(err.message)
    );
  });

  test('the API key never appears in a thrown error message or in logged output', async () => {
    const secretKey = 'sk-super-secret-do-not-log-me';
    const provider = createOpenRouterProvider({ baseUrl: mockServer.url, apiKey: secretKey, model: 'm' });
    mockServer.setFailing(true);

    const originalLog = console.log;
    const originalError = console.error;
    const captured = [];
    const capture = (...args) => captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    console.log = capture;
    console.error = capture;

    let caught;
    try {
      await provider.generateCompletion({ messages: [{ role: 'user', content: 'hi' }] });
    } catch (err) {
      caught = err;
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    assert.ok(caught, 'expected generateCompletion to throw');
    assert.ok(!caught.message.includes(secretKey));
    assert.ok(!captured.join('\n').includes(secretKey));
  });
});

describe('LLMService (llm.service.js) -- env-driven provider selection', () => {
  let mockServer;
  let generateCompletion;

  before(async () => {
    mockServer = await startMockLLMServer();

    process.env.LLM_PROVIDER = 'openrouter';
    process.env.LLM_BASE_URL = mockServer.url;
    process.env.LLM_API_KEY = 'test-llm-key';
    process.env.LLM_MODEL_NAME = 'test-model';

    ({ generateCompletion } = await import('../src/services/llm.service.js'));
  });

  after(async () => {
    await mockServer.close();
  });

  beforeEach(() => {
    mockServer.setFailing(false);
    mockServer.setDelayMs(0);
    mockServer.setMalformed(false);
    mockServer.setRateLimited(false);
  });

  test('delegates to the configured provider and returns its completion', async () => {
    const result = await generateCompletion({ messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(result.content, 'mock openrouter reply');
  });

  test('rejects an empty messages array before ever reaching a provider', async () => {
    const countBefore = mockServer.getRequestCount();
    await assert.rejects(() => generateCompletion({ messages: [] }), LLMError);
    assert.equal(mockServer.getRequestCount(), countBefore);
  });

  test('wraps an upstream failure as an LLMError rather than leaking the raw provider error', async () => {
    mockServer.setFailing(true);
    await assert.rejects(() => generateCompletion({ messages: [{ role: 'user', content: 'hi' }] }), LLMError);
  });

  test('a rate-limit response is passed through as RateLimitError, not flattened to a generic LLMError', async () => {
    mockServer.setRateLimited(true, 5);
    await assert.rejects(
      () => generateCompletion({ messages: [{ role: 'user', content: 'hi' }] }),
      (err) => err instanceof RateLimitError && err.statusCode === 429
    );
  });
});
