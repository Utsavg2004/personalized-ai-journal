import http from 'node:http';

/**
 * Minimal in-process stand-in for an OpenAI-compatible `/embeddings`
 * endpoint, mirroring how mockSupabaseServer.js stands in for Supabase: lets
 * embedding.service.js and the journal ingestion pipeline be exercised
 * against a real HTTP request/response, instead of hand-mocking `fetch`.
 *
 * Returns deterministic (not random) vectors so tests can assert on them,
 * and exposes `setFailing`/`getRequestCount` so a test can simulate a
 * provider outage mid-flow.
 */
export const startMockEmbeddingServer = ({ dimension = 8 } = {}) => {
  let failing = false;
  let requestCount = 0;
  let lastRequestBody = null;

  const deterministicVector = (seed) =>
    Array.from({ length: dimension }, (_, i) => Number(Math.sin(seed * (i + 1)).toFixed(6)));

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

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/embeddings') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Unhandled mock route: ${req.method} ${req.url}` }));
      return;
    }

    requestCount += 1;
    const body = await readJsonBody(req);
    lastRequestBody = body;

    if (failing) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'mock embedding provider failure' } }));
      return;
    }

    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const data = inputs.map((text, index) => ({
      index,
      embedding: deterministicVector(String(text).length + index + 1),
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data, model: body.model }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        setFailing: (value) => {
          failing = value;
        },
        getRequestCount: () => requestCount,
        getLastRequestBody: () => lastRequestBody,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
};
