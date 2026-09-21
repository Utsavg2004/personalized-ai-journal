import http from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * Minimal in-process stand-in for the subset of Supabase's REST surface that
 * `@supabase/supabase-js` calls into for this app's tests:
 *
 *   Auth (GoTrue):
 *     POST /auth/v1/signup
 *     POST /auth/v1/token?grant_type=password
 *     GET  /auth/v1/user
 *     POST /auth/v1/logout
 *
 *   Data API (PostgREST), generic for any table under /rest/v1/<table>:
 *     POST   /rest/v1/<table>            (insert)
 *     GET    /rest/v1/<table>            (select, with eq filters/order/offset/limit)
 *     PATCH  /rest/v1/<table>            (update matching rows)
 *     DELETE /rest/v1/<table>            (delete matching rows)
 *
 *   RPC (PostgREST), one handler implemented -- `match_journal_chunks` --
 *   since it's the only stored function this app calls:
 *     POST /rest/v1/rpc/<fn>
 *
 * There is no live Supabase project available in this environment, so this
 * server lets services/repositories/controllers be exercised against real
 * HTTP + real @supabase/supabase-js request building and response parsing,
 * instead of hand-mocking the SDK's internals. Query-string/header shapes
 * (`eq.`, `order=col.dir`, `offset`/`limit`, `Prefer: count=exact`,
 * `content-range` response header) were derived from reading
 * `@supabase/postgrest-js`'s own request-building code (see
 * node_modules/@supabase/postgrest-js/dist/index.mjs).
 */
export const startMockSupabaseServer = () => {
  const usersByEmail = new Map(); // email -> { id, email, password, user_metadata, created_at }
  const validTokens = new Map(); // access_token -> userId
  const tables = new Map(); // tableName -> array of row objects

  const getTable = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  const readJsonBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        if (!raw) return resolve(undefined);
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });

  const sendJson = (res, status, body, extraHeaders = {}) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
    res.end(payload);
  };

  // ---------------------------------------------------------------------
  // Auth (GoTrue) handlers
  // ---------------------------------------------------------------------

  const toPublicUser = (user) => ({
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.created_at,
    created_at: user.created_at,
    user_metadata: user.user_metadata,
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [{ id: randomUUID(), user_id: user.id, provider: 'email' }],
  });

  const issueSession = (user) => {
    const accessToken = `mock_at_${randomUUID()}`;
    const refreshToken = `mock_rt_${randomUUID()}`;
    validTokens.set(accessToken, user.id);
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: refreshToken,
      user: toPublicUser(user),
    };
  };

  const handleAuthRequest = async (req, res, url) => {
    if (req.method === 'POST' && url.pathname === '/auth/v1/signup') {
      const body = await readJsonBody(req);

      if (usersByEmail.has(body.email)) {
        return sendJson(res, 400, { msg: 'User already registered', error_code: 'user_already_exists' });
      }

      const user = {
        id: randomUUID(),
        email: body.email,
        password: body.password,
        user_metadata: body.data ?? {},
        created_at: new Date().toISOString(),
      };
      usersByEmail.set(user.email, user);

      return sendJson(res, 200, issueSession(user));
    }

    if (req.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = await readJsonBody(req);
      const user = usersByEmail.get(body.email);

      if (!user || user.password !== body.password) {
        return sendJson(res, 400, { msg: 'Invalid login credentials', error_code: 'invalid_credentials' });
      }

      return sendJson(res, 200, issueSession(user));
    }

    if (req.method === 'GET' && url.pathname === '/auth/v1/user') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const userId = validTokens.get(token);

      if (!userId) {
        return sendJson(res, 401, { msg: 'Invalid token', error_code: 'bad_jwt' });
      }

      const user = [...usersByEmail.values()].find((u) => u.id === userId);
      return sendJson(res, 200, toPublicUser(user));
    }

    if (req.method === 'POST' && url.pathname === '/auth/v1/logout') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');

      if (!validTokens.has(token)) {
        return sendJson(res, 401, { msg: 'Invalid token', error_code: 'bad_jwt' });
      }

      validTokens.delete(token);
      res.writeHead(204);
      return res.end();
    }

    return null; // not an auth route
  };

  // ---------------------------------------------------------------------
  // Data API (PostgREST-subset) handlers
  // ---------------------------------------------------------------------

  const parseEqFilters = (searchParams) => {
    const filters = [];
    for (const [key, value] of searchParams.entries()) {
      if (['select', 'order', 'offset', 'limit'].includes(key)) continue;
      const match = /^eq\.(.*)$/.exec(value);
      if (match) filters.push({ column: key, value: match[1] });
    }
    return filters;
  };

  const applyFilters = (rows, filters) =>
    rows.filter((row) => filters.every((f) => String(row[f.column]) === f.value));

  const applyOrder = (rows, orderParam) => {
    if (!orderParam) return rows;
    const [column, direction] = orderParam.split('.');
    const sorted = [...rows].sort((a, b) => {
      if (a[column] === b[column]) return 0;
      return a[column] > b[column] ? 1 : -1;
    });
    if (direction === 'desc') sorted.reverse();
    return sorted;
  };

  const projectSelect = (rows, selectParam) => {
    if (!selectParam || selectParam === '*') return rows.map((row) => ({ ...row }));
    const columns = selectParam.split(',').map((c) => c.trim());
    return rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  };

  const contentRangeHeader = (offset, returnedCount, total) => {
    if (returnedCount === 0) return { 'content-range': `*/${total}` };
    return { 'content-range': `${offset}-${offset + returnedCount - 1}/${total}` };
  };

  const handleRestRequest = async (req, res, url) => {
    const match = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;

    const tableName = match[1];
    const store = getTable(tableName);
    const prefer = req.headers['prefer'] || '';
    const wantsCount = /count=exact/.test(prefer);
    const selectParam = url.searchParams.get('select');

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const items = Array.isArray(body) ? body : [body];
      const now = new Date().toISOString();
      const inserted = items.map((item) => {
        const row = { id: randomUUID(), created_at: now, updated_at: now, ...item };
        store.push(row);
        return row;
      });
      return sendJson(res, 201, projectSelect(inserted, selectParam));
    }

    if (req.method === 'GET') {
      const filters = parseEqFilters(url.searchParams);
      let rows = applyFilters(store, filters);
      const total = rows.length;
      rows = applyOrder(rows, url.searchParams.get('order'));

      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = url.searchParams.get('limit');
      const page = limit !== null ? rows.slice(offset, offset + Number(limit)) : rows.slice(offset);

      const headers = wantsCount ? contentRangeHeader(offset, page.length, total) : {};
      return sendJson(res, 200, projectSelect(page, selectParam), headers);
    }

    if (req.method === 'PATCH') {
      const filters = parseEqFilters(url.searchParams);
      const body = await readJsonBody(req);
      const now = new Date().toISOString();
      const updated = [];

      for (const row of store) {
        if (filters.every((f) => String(row[f.column]) === f.value)) {
          Object.assign(row, body, { updated_at: now });
          updated.push(row);
        }
      }

      return sendJson(res, 200, projectSelect(updated, selectParam));
    }

    if (req.method === 'DELETE') {
      const filters = parseEqFilters(url.searchParams);
      const removed = [];

      for (let i = store.length - 1; i >= 0; i -= 1) {
        if (filters.every((f) => String(store[i][f.column]) === f.value)) {
          removed.push(store[i]);
          store.splice(i, 1);
        }
      }

      return sendJson(res, 200, projectSelect(removed, selectParam));
    }

    return null;
  };

  // ---------------------------------------------------------------------
  // RPC handlers -- only `match_journal_chunks` (the vector similarity
  // search function from supabase/migrations/..._match_journal_chunks_
  // function.sql). Reimplements its cosine-similarity + `user_id` filter +
  // threshold + limit logic in JS over the in-memory `journal_chunks` rows,
  // so tests can exercise real tenant-isolation behavior for vector search
  // without a live Postgres/pgvector instance.
  // ---------------------------------------------------------------------

  const cosineSimilarity = (a, b) => {
    const len = Math.min(a?.length ?? 0, b?.length ?? 0);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i += 1) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const rpcHandlers = {
    match_journal_chunks: (body) => {
      const store = getTable('journal_chunks');
      const matchUserId = body.match_user_id;
      const matchCount = Math.min(Number(body.match_count ?? 5), 50);
      const matchThreshold = Number(body.match_threshold ?? 0);

      return store
        .filter((row) => String(row.user_id) === String(matchUserId))
        .map((row) => ({
          id: row.id,
          journal_id: row.journal_id,
          chunk_index: row.chunk_index,
          chunk_text: row.chunk_text,
          metadata: row.metadata,
          similarity: cosineSimilarity(row.embedding, body.query_embedding),
        }))
        .filter((row) => row.similarity > matchThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, matchCount);
    },
  };

  const handleRpcRequest = async (req, res, url) => {
    const match = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(url.pathname);
    if (!match) return null;

    const handler = rpcHandlers[match[1]];
    if (!handler) {
      return sendJson(res, 404, { msg: `Unhandled mock rpc: ${match[1]}` });
    }

    const body = (await readJsonBody(req)) ?? {};
    return sendJson(res, 200, handler(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://internal.local');

    try {
      let handled;
      if (url.pathname.startsWith('/auth/v1/')) {
        handled = await handleAuthRequest(req, res, url);
      } else if (url.pathname.startsWith('/rest/v1/rpc/')) {
        handled = await handleRpcRequest(req, res, url);
      } else {
        handled = await handleRestRequest(req, res, url);
      }

      if (handled === null) {
        sendJson(res, 404, { msg: `Unhandled mock route: ${req.method} ${url.pathname}` });
      }
    } catch (err) {
      sendJson(res, 500, { msg: err.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
};
