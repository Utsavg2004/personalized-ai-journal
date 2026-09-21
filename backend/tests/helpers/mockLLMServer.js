import http from 'node:http';

/**
 * Minimal in-process stand-in for both LLM providers' chat endpoints:
 *   - OpenRouter (OpenAI-compatible): POST /chat/completions
 *   - Ollama:                          POST /api/chat
 * mirrors mockEmbeddingServer.js -- lets llmProviders/ and llm.service.js be
 * exercised against real HTTP request/response instead of a hand-mocked
 * `fetch`. Supports simulating an upstream failure (`setFailing`) and a
 * slow response (`setDelayMs`) so timeout/error-handling paths can be
 * tested without a real provider.
 */
export const startMockLLMServer = () => {
  let failing = false;
  let delayMs = 0;
  let malformed = false;
  let rateLimited = false;
  let retryAfterSeconds = null;
  let lastRequestBody = null;
  let lastRequestHeaders = null;
  let requestCount = 0;

  const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });

  const sendJson = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    requestCount += 1;
    const body = await readJsonBody(req);
    lastRequestBody = body;
    lastRequestHeaders = req.headers;

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (rateLimited) {
      const headers = { 'Content-Type': 'application/json' };
      if (retryAfterSeconds !== null) headers['Retry-After'] = String(retryAfterSeconds);
      res.writeHead(429, headers);
      res.end(JSON.stringify({ error: { message: 'rate limit exceeded' } }));
      return;
    }

    if (failing) {
      sendJson(res, 500, { error: { message: 'mock LLM provider failure' } });
      return;
    }

    if (malformed) {
      sendJson(res, 200, { unexpected: 'shape' });
      return;
    }

    if (req.url === '/chat/completions') {
      sendJson(res, 200, {
        model: body.model,
        choices: [{ message: { role: 'assistant', content: 'mock openrouter reply' }, finish_reason: 'stop' }],
      });
      return;
    }

    if (req.url === '/api/chat') {
      sendJson(res, 200, {
        model: body.model,
        message: { role: 'assistant', content: 'mock ollama reply' },
        done: true,
        done_reason: 'stop',
      });
      return;
    }

    sendJson(res, 404, { error: `Unhandled mock route: ${req.method} ${req.url}` });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        setFailing: (value) => {
          failing = value;
        },
        setDelayMs: (value) => {
          delayMs = value;
        },
        setMalformed: (value) => {
          malformed = value;
        },
        setRateLimited: (value, retryAfter = null) => {
          rateLimited = value;
          retryAfterSeconds = retryAfter;
        },
        getLastRequestBody: () => lastRequestBody,
        getLastRequestHeaders: () => lastRequestHeaders,
        getRequestCount: () => requestCount,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
};
