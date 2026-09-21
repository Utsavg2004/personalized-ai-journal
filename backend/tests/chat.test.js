import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startMockSupabaseServer } from './helpers/mockSupabaseServer.js';
import { startMockEmbeddingServer } from './helpers/mockEmbeddingServer.js';
import { startMockLLMServer } from './helpers/mockLLMServer.js';

let app;
let mockSupabase;
let mockEmbedding;
let mockLLM;
let storeEmbedding;

describe('POST /api/chat', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    mockSupabase = await startMockSupabaseServer();
    mockEmbedding = await startMockEmbeddingServer();
    mockLLM = await startMockLLMServer();

    process.env.SUPABASE_URL = mockSupabase.url;
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_BASE_URL = mockEmbedding.url;
    process.env.LLM_PROVIDER = 'openrouter';
    process.env.LLM_BASE_URL = mockLLM.url;

    const vectorRepo = await import('../src/repositories/vector.repository.js');
    storeEmbedding = vectorRepo.storeEmbedding;

    // Must import app *after* env is set
    ({ default: app } = await import('../src/app.js'));
  });

  after(async () => {
    await mockSupabase.close();
    await mockEmbedding.close();
    await mockLLM.close();
  });

  beforeEach(() => {
    mockLLM.setFailing(false);
    mockEmbedding.setFailing(false);
  });

  // Helper to register a user and get a token
  const registerAndGetToken = async (email) => {
    const res = await request(mockSupabase.url)
      .post('/auth/v1/signup')
      .send({ email, password: 'password123' });
    return { token: res.body.access_token, userId: res.body.user.id };
  };

  test('Requires authentication', async () => {
    const res = await request(app).post('/api/chat').send({ message: 'Hello' });
    assert.equal(res.status, 401);
    assert.match(res.body.error.message, /Missing or invalid Authorization header/);
  });

  test('Validates input (empty message)', async () => {
    const { token } = await registerAndGetToken('test1@example.com');
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '' });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Message cannot be empty/);
  });

  test('Completes the full RAG chat flow and returns answer and sources', async () => {
    const { token, userId } = await registerAndGetToken('test2@example.com');
    
    const { embedText } = await import('../src/services/embedding.service.js');
    const exactQueryEmbedding = await embedText('What did I do today?');

    await storeEmbedding({
      journalId: 'journal-chat-1',
      userId,
      chunkIndex: 0,
      chunkText: 'I wrote a backend in Node.js today.',
      embedding: exactQueryEmbedding,
      metadata: { title: 'Coding' },
    });

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'What did I do today?' });

    assert.equal(res.status, 200);
    assert.equal(res.body.answer, 'mock openrouter reply'); // LLM mock default
    assert.equal(res.body.sources.length, 1);
    assert.equal(res.body.sources[0].journalId, 'journal-chat-1');
    assert.ok(res.body.conversationId);
  });

  test('Handles conversation ID authorization failure', async () => {
    // User A and User B
    const userA = await registerAndGetToken('usera@example.com');
    const userB = await registerAndGetToken('userb@example.com');

    // Manually create a conversation for User B in the mock db
    const convReq = await request(mockSupabase.url)
      .post('/rest/v1/conversations')
      .send({ user_id: userB.userId });
    
    const convId = convReq.body[0].id;

    // User A attempts to use User B's conversationId
    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ conversationId: convId, message: 'Hello?' });

    // Should return 404 (NotFoundError masked as 404 to avoid exposing ID existence)
    assert.equal(res.status, 404);
    assert.match(res.body.error.message, /Conversation not found/);
  });
});
