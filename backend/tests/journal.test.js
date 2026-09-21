import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startMockSupabaseServer } from './helpers/mockSupabaseServer.js';
import { startMockEmbeddingServer } from './helpers/mockEmbeddingServer.js';

// The env vars driving @supabase/supabase-js must be set before `app.js`
// (and anything it imports) is first loaded, so the app must be imported
// dynamically here -- a static `import` would be hoisted above this setup.
let app;
let mockServer;
let mockEmbeddingServer;

before(async () => {
  mockServer = await startMockSupabaseServer();
  process.env.SUPABASE_URL = mockServer.url;
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  // Journal creation triggers chunk embedding (see embedding.test.js for
  // dedicated coverage of that pipeline); point it at a local mock so these
  // CRUD-focused tests don't depend on -- or pay the cost of -- a real
  // embedding provider.
  mockEmbeddingServer = await startMockEmbeddingServer();
  process.env.EMBEDDING_PROVIDER = 'openai';
  process.env.EMBEDDING_BASE_URL = mockEmbeddingServer.url;
  process.env.EMBEDDING_API_KEY = 'test-embedding-key';
  process.env.EMBEDDING_MODEL = 'test-embedding-model';

  ({ default: app } = await import('../src/app.js'));
});

after(async () => {
  await mockServer.close();
  await mockEmbeddingServer.close();
});

const uniqueEmail = () => `user_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;

const registerAndLogin = async () => {
  const email = uniqueEmail();
  const password = 'correct-horse-battery';
  await request(app).post('/api/auth/register').send({ email, password });
  const loginRes = await request(app).post('/api/auth/login').send({ email, password });
  return { email, accessToken: loginRes.body.session.accessToken, userId: loginRes.body.user.id };
};

const authed = (req, token) => req.set('Authorization', `Bearer ${token}`);

describe('Journal endpoints', () => {
  describe('Authentication is required on every route', () => {
    test('POST /api/journals rejects an unauthenticated request', async () => {
      const res = await request(app).post('/api/journals').send({ content: 'hello' });
      assert.equal(res.status, 401);
    });

    test('GET /api/journals rejects an unauthenticated request', async () => {
      const res = await request(app).get('/api/journals');
      assert.equal(res.status, 401);
    });

    test('GET /api/journals/:id rejects an unauthenticated request', async () => {
      const res = await request(app).get('/api/journals/00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 401);
    });

    test('PATCH /api/journals/:id rejects an unauthenticated request', async () => {
      const res = await request(app)
        .patch('/api/journals/00000000-0000-0000-0000-000000000000')
        .send({ title: 'x' });
      assert.equal(res.status, 401);
    });

    test('DELETE /api/journals/:id rejects an unauthenticated request', async () => {
      const res = await request(app).delete('/api/journals/00000000-0000-0000-0000-000000000000');
      assert.equal(res.status, 401);
    });
  });

  describe('Validation', () => {
    test('POST /api/journals rejects missing content', async () => {
      const { accessToken } = await registerAndLogin();
      const res = await authed(request(app).post('/api/journals'), accessToken).send({ title: 'no content' });

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('GET /api/journals/:id rejects a non-UUID id', async () => {
      const { accessToken } = await registerAndLogin();
      const res = await authed(request(app).get('/api/journals/not-a-uuid'), accessToken);

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('PATCH /api/journals/:id rejects an empty update body', async () => {
      const { accessToken } = await registerAndLogin();
      const created = await authed(request(app).post('/api/journals'), accessToken).send({ content: 'body' });

      const res = await authed(request(app).patch(`/api/journals/${created.body.data.id}`), accessToken).send({});

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    test('GET /api/journals rejects an out-of-range pageSize', async () => {
      const { accessToken } = await registerAndLogin();
      const res = await authed(request(app).get('/api/journals?pageSize=500'), accessToken);

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });
  });

  describe('CRUD happy path', () => {
    test('POST /api/journals creates a journal owned by the caller', async () => {
      const { accessToken } = await registerAndLogin();

      const res = await authed(request(app).post('/api/journals'), accessToken).send({
        title: 'My first entry',
        content: 'Today was a good day.',
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.title, 'My first entry');
      assert.equal(res.body.data.content, 'Today was a good day.');
      assert.ok(res.body.data.id);
    });

    test('GET /api/journals paginates the caller\'s own journals, newest first', async () => {
      const { accessToken } = await registerAndLogin();

      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await authed(request(app).post('/api/journals'), accessToken).send({ content: `entry ${i}` });
      }

      const page1 = await authed(request(app).get('/api/journals?page=1&pageSize=2'), accessToken);

      assert.equal(page1.status, 200);
      assert.equal(page1.body.data.length, 2);
      assert.equal(page1.body.meta.total, 3);
      assert.equal(page1.body.meta.page, 1);
      assert.equal(page1.body.meta.pageSize, 2);
      assert.equal(page1.body.meta.totalPages, 2);
      // newest first
      assert.equal(page1.body.data[0].content, 'entry 2');

      const page2 = await authed(request(app).get('/api/journals?page=2&pageSize=2'), accessToken);
      assert.equal(page2.body.data.length, 1);
      assert.equal(page2.body.data[0].content, 'entry 0');
    });

    test('GET /api/journals/:id returns a journal the caller owns', async () => {
      const { accessToken } = await registerAndLogin();
      const created = await authed(request(app).post('/api/journals'), accessToken).send({ content: 'mine' });

      const res = await authed(request(app).get(`/api/journals/${created.body.data.id}`), accessToken);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.id, created.body.data.id);
      assert.equal(res.body.data.content, 'mine');
    });

    test('GET /api/journals/:id returns 404 for a non-existent id', async () => {
      const { accessToken } = await registerAndLogin();
      const res = await authed(
        request(app).get('/api/journals/00000000-0000-0000-0000-000000000000'),
        accessToken
      );

      assert.equal(res.status, 404);
    });

    test('PATCH /api/journals/:id updates title and content for the owner', async () => {
      const { accessToken } = await registerAndLogin();
      const created = await authed(request(app).post('/api/journals'), accessToken).send({
        title: 'old title',
        content: 'old content',
      });

      const res = await authed(
        request(app).patch(`/api/journals/${created.body.data.id}`),
        accessToken
      ).send({ title: 'new title', content: 'new content' });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.title, 'new title');
      assert.equal(res.body.data.content, 'new content');
    });

    test('DELETE /api/journals/:id removes the journal for the owner', async () => {
      const { accessToken } = await registerAndLogin();
      const created = await authed(request(app).post('/api/journals'), accessToken).send({ content: 'to delete' });

      const del = await authed(request(app).delete(`/api/journals/${created.body.data.id}`), accessToken);
      assert.equal(del.status, 200);

      const getAfter = await authed(request(app).get(`/api/journals/${created.body.data.id}`), accessToken);
      assert.equal(getAfter.status, 404);
    });
  });

  describe('Cross-user isolation (ownership enforcement)', () => {
    test('User B cannot read a journal created by User A', async () => {
      const userA = await registerAndLogin();
      const userB = await registerAndLogin();

      const created = await authed(request(app).post('/api/journals'), userA.accessToken).send({
        content: "A's private entry",
      });

      // User A can read it.
      const asA = await authed(request(app).get(`/api/journals/${created.body.data.id}`), userA.accessToken);
      assert.equal(asA.status, 200);

      // User B cannot.
      const asB = await authed(request(app).get(`/api/journals/${created.body.data.id}`), userB.accessToken);
      assert.equal(asB.status, 404);
    });

    test("User B cannot update User A's journal", async () => {
      const userA = await registerAndLogin();
      const userB = await registerAndLogin();

      const created = await authed(request(app).post('/api/journals'), userA.accessToken).send({
        content: 'original',
      });

      const asB = await authed(
        request(app).patch(`/api/journals/${created.body.data.id}`),
        userB.accessToken
      ).send({ content: 'hijacked' });
      assert.equal(asB.status, 404);

      // Content is unchanged when read back by the real owner.
      const asA = await authed(request(app).get(`/api/journals/${created.body.data.id}`), userA.accessToken);
      assert.equal(asA.body.data.content, 'original');
    });

    test("User B cannot delete User A's journal", async () => {
      const userA = await registerAndLogin();
      const userB = await registerAndLogin();

      const created = await authed(request(app).post('/api/journals'), userA.accessToken).send({
        content: 'do not delete me',
      });

      const asB = await authed(request(app).delete(`/api/journals/${created.body.data.id}`), userB.accessToken);
      assert.equal(asB.status, 404);

      // Still there for the real owner.
      const asA = await authed(request(app).get(`/api/journals/${created.body.data.id}`), userA.accessToken);
      assert.equal(asA.status, 200);
    });

    test("User B's own journal list never includes User A's journals", async () => {
      const userA = await registerAndLogin();
      const userB = await registerAndLogin();

      await authed(request(app).post('/api/journals'), userA.accessToken).send({ content: "A's entry" });
      await authed(request(app).post('/api/journals'), userB.accessToken).send({ content: "B's entry" });

      const listAsB = await authed(request(app).get('/api/journals'), userB.accessToken);

      assert.equal(listAsB.status, 200);
      assert.equal(listAsB.body.data.length, 1);
      assert.equal(listAsB.body.data[0].content, "B's entry");
    });
  });
});
