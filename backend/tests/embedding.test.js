import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startMockSupabaseServer } from './helpers/mockSupabaseServer.js';
import { startMockEmbeddingServer } from './helpers/mockEmbeddingServer.js';
import { chunkText, CHUNK_SIZE } from '../src/utils/chunkText.js';

describe('chunkText (pure, no network)', () => {
  test('empty/whitespace-only content produces no chunks', () => {
    assert.deepEqual(chunkText(''), []);
    assert.deepEqual(chunkText('   \n  '), []);
  });

  test('a short journal produces exactly one chunk equal to the trimmed content', () => {
    const content = '  Today was a good day. I went for a walk.  ';
    const chunks = chunkText(content);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], content.trim());
  });

  test('a long journal produces multiple chunks, none empty, none exceeding the window by much', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog. ';
    const content = sentence.repeat(80); // well over CHUNK_SIZE characters
    const chunks = chunkText(content);

    assert.ok(chunks.length > 1, 'expected more than one chunk for long content');
    for (const chunk of chunks) {
      assert.ok(chunk.length > 0, 'no chunk should be empty');
      assert.ok(chunk.length <= CHUNK_SIZE + 80, 'chunk should not far exceed the target window');
    }
  });

  test('consecutive chunks overlap so no sentence is silently dropped at a boundary', () => {
    const sentence = 'Alpha bravo charlie delta echo foxtrot golf hotel. ';
    const content = sentence.repeat(60);
    const chunks = chunkText(content);

    assert.ok(chunks.length > 1);
    // The tail of each chunk should reappear at the head of the next one.
    const tailOfFirst = chunks[0].slice(-50);
    assert.ok(chunks[1].includes(tailOfFirst.trim().split(' ').slice(-3).join(' ')));
  });
});

describe('Journal creation -> chunking -> embedding -> vector storage', () => {
  let app;
  let mockSupabase;
  let mockEmbedding;

  before(async () => {
    mockSupabase = await startMockSupabaseServer();
    mockEmbedding = await startMockEmbeddingServer({ dimension: 8 });

    process.env.SUPABASE_URL = mockSupabase.url;
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_BASE_URL = mockEmbedding.url;
    process.env.EMBEDDING_API_KEY = 'test-embedding-key';
    process.env.EMBEDDING_MODEL = 'test-embedding-model';

    ({ default: app } = await import('../src/app.js'));
  });

  after(async () => {
    await mockSupabase.close();
    await mockEmbedding.close();
  });

  beforeEach(() => {
    mockEmbedding.setFailing(false);
  });

  const uniqueEmail = () => `user_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;

  const registerAndLogin = async () => {
    const email = uniqueEmail();
    const password = 'correct-horse-battery';
    await request(app).post('/api/auth/register').send({ email, password });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    return { accessToken: loginRes.body.session.accessToken, userId: loginRes.body.user.id };
  };

  const authed = (req, token) => req.set('Authorization', `Bearer ${token}`);

  const fetchChunksForJournal = async (journalId) => {
    const res = await fetch(
      `${mockSupabase.url}/rest/v1/journal_chunks?journal_id=eq.${journalId}&order=chunk_index.asc`,
      { headers: { apikey: 'test', Authorization: 'Bearer test' } }
    );
    return res.json();
  };

  const fetchJournalRow = async (journalId) => {
    const res = await fetch(`${mockSupabase.url}/rest/v1/journals?id=eq.${journalId}`, {
      headers: { apikey: 'test', Authorization: 'Bearer test' },
    });
    const rows = await res.json();
    return rows[0] ?? null;
  };

  test('a short journal is embedded into exactly one chunk carrying journal_id/user_id/chunk_index/metadata', async () => {
    const { accessToken, userId } = await registerAndLogin();

    const res = await authed(request(app).post('/api/journals'), accessToken).send({
      title: 'Short entry',
      content: 'Today was a good day. I went for a walk in the park.',
    });

    assert.equal(res.status, 201);
    const journalId = res.body.data.id;

    const chunks = await fetchChunksForJournal(journalId);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].journal_id, journalId);
    assert.equal(chunks[0].user_id, userId);
    assert.equal(chunks[0].chunk_index, 0);
    assert.equal(chunks[0].metadata.title, 'Short entry');
    assert.equal(chunks[0].metadata.chunkCount, 1);
    assert.equal(chunks[0].embedding.length, 8);
  });

  test('a long journal is split into multiple ordered chunks, each with its own embedding', async () => {
    const { accessToken, userId } = await registerAndLogin();
    const longContent = 'The quick brown fox jumps over the lazy dog. '.repeat(60);

    const res = await authed(request(app).post('/api/journals'), accessToken).send({
      title: 'Long entry',
      content: longContent,
    });

    assert.equal(res.status, 201);
    const journalId = res.body.data.id;

    const chunks = await fetchChunksForJournal(journalId);
    assert.ok(chunks.length > 1, 'expected multiple chunks for a long journal');

    chunks.forEach((chunk, index) => {
      assert.equal(chunk.journal_id, journalId);
      assert.equal(chunk.user_id, userId);
      assert.equal(chunk.chunk_index, index);
      assert.equal(chunk.metadata.chunkCount, chunks.length);
      assert.equal(chunk.embedding.length, 8);
    });
  });

  test('when embedding generation fails, the journal is rolled back and a 502 is returned', async () => {
    const { accessToken, userId } = await registerAndLogin();
    mockEmbedding.setFailing(true);

    const res = await authed(request(app).post('/api/journals'), accessToken).send({
      content: 'This entry should never be persisted because embedding fails.',
    });

    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'EMBEDDING_ERROR');

    // The journal must not exist -- neither via the API nor directly in the store.
    const listRes = await authed(request(app).get('/api/journals'), accessToken);
    assert.equal(listRes.body.data.length, 0);

    // No orphaned chunks either.
    const res2 = await fetch(`${mockSupabase.url}/rest/v1/journal_chunks?user_id=eq.${userId}`, {
      headers: { apikey: 'test', Authorization: 'Bearer test' },
    });
    assert.deepEqual(await res2.json(), []);
  });

  test('journal content is never logged, even when embedding fails', async () => {
    const { accessToken } = await registerAndLogin();
    const secretMarker = `SECRET_MARKER_${Date.now()}_do-not-log-me`;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const captured = [];
    const capture = (...args) => captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    console.log = capture;
    console.error = capture;
    console.warn = capture;

    try {
      // Happy path.
      await authed(request(app).post('/api/journals'), accessToken).send({ content: secretMarker });

      // Failure path (rollback logging must also stay silent on content).
      mockEmbedding.setFailing(true);
      await authed(request(app).post('/api/journals'), accessToken).send({ content: secretMarker });
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }

    const leaked = captured.some((line) => line.includes(secretMarker));
    assert.equal(leaked, false, 'journal content must never appear in logs');
  });
});
