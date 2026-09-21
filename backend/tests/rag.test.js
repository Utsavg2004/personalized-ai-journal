import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startMockSupabaseServer } from './helpers/mockSupabaseServer.js';
import { startMockEmbeddingServer } from './helpers/mockEmbeddingServer.js';
import { startMockLLMServer } from './helpers/mockLLMServer.js';

let mockSupabase;
let mockEmbedding;
let mockLLM;
let answerQuestion;
let storeEmbedding;

describe('RAG Pipeline', () => {
  before(async () => {
    // 1. Start all mock servers
    mockSupabase = await startMockSupabaseServer();
    mockEmbedding = await startMockEmbeddingServer();
    mockLLM = await startMockLLMServer();

    // 2. Point env vars to mocks BEFORE importing services
    process.env.SUPABASE_URL = mockSupabase.url;
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_BASE_URL = mockEmbedding.url;
    process.env.EMBEDDING_API_KEY = 'test-emb-key';
    process.env.EMBEDDING_MODEL = 'test-emb-model';

    process.env.LLM_PROVIDER = 'openrouter';
    process.env.LLM_BASE_URL = mockLLM.url;
    process.env.LLM_API_KEY = 'test-llm-key';
    process.env.LLM_MODEL_NAME = 'test-llm-model';

    // 3. Import services
    const ragService = await import('../src/services/rag.service.js');
    const vectorRepo = await import('../src/repositories/vector.repository.js');
    
    answerQuestion = ragService.answerQuestion;
    storeEmbedding = vectorRepo.storeEmbedding;
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

  test('User A asks a question and receives an answer grounded in their own journal context', async () => {
    // We must use the exact embedding the mock server will generate for the query,
    // otherwise the cosine similarity might be <= 0 and get filtered out.
    const { embedText } = await import('../src/services/embedding.service.js');
    const exactQueryEmbedding = await embedText('What did I eat for breakfast on Tuesday?');

    await storeEmbedding({
      journalId: 'journal-test-1',
      userId: 'user-test-1',
      chunkIndex: 0,
      chunkText: 'I had eggs and toast for breakfast on Tuesday.',
      embedding: exactQueryEmbedding,
      metadata: { title: 'Tuesday Breakfast' },
    });

    const result = await answerQuestion({
      userId: 'user-test-1',
      question: 'What did I eat for breakfast on Tuesday?',
    });

    // Verify sources
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].journalId, 'journal-test-1');

    // Verify the LLM was called with the context
    const llmReq = mockLLM.getLastRequestBody();
    const systemPrompt = llmReq.messages[0].content;
    
    assert.ok(systemPrompt.includes('I had eggs and toast for breakfast on Tuesday.'));
    assert.ok(systemPrompt.includes('DO NOT invent facts'));

    // LLM mock returns 'mock openrouter reply' by default for OpenRouter
    assert.equal(result.answer, 'mock openrouter reply');
  });

  test('Question with no matching journal context (model should not invent answer)', async () => {
    // Nothing inserted in mock Supabase

    const result = await answerQuestion({
      userId: 'user-test-2',
      question: 'What is the capital of France?',
    });

    // Zero sources
    assert.equal(result.sources.length, 0);

    const llmReq = mockLLM.getLastRequestBody();
    const systemPrompt = llmReq.messages[0].content;
    
    assert.ok(systemPrompt.includes('(No journal context found)'));
    assert.ok(systemPrompt.includes('I could not find the answer to that in your journal entries.'));
  });

  test("User A asking about User B's data (must not retrieve User B's context)", async () => {
    // Insert User B's data
    await storeEmbedding({
      journalId: 'journal-test-3',
      userId: 'user-test-3-B',
      chunkIndex: 0,
      chunkText: 'I ate pancakes for breakfast.',
      embedding: [0.1, 0.2, 0.3],
      metadata: {},
    });

    const result = await answerQuestion({
      userId: 'user-test-3-A', // User A is asking
      question: 'What did User B eat for breakfast?',
    });

    // Must be 0 sources because the repo scopes to `match_user_id`
    assert.equal(result.sources.length, 0);

    const llmReq = mockLLM.getLastRequestBody();
    assert.ok(llmReq.messages[0].content.includes('(No journal context found)'));
  });
});
