import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startMockSupabaseServer } from './helpers/mockSupabaseServer.js';

// vector.repository.js reads `supabaseAdmin` (built from SUPABASE_* env vars
// at import time), so those must be set -- and the module imported
// dynamically -- before any static import would run.
let storeEmbedding;
let deleteJournalEmbeddings;
let searchSimilar;
let mockServer;

before(async () => {
  mockServer = await startMockSupabaseServer();
  process.env.SUPABASE_URL = mockServer.url;
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  ({ storeEmbedding, deleteJournalEmbeddings, searchSimilar } = await import(
    '../src/repositories/vector.repository.js'
  ));
});

after(async () => {
  await mockServer.close();
});

// A fixed-direction vector so "how similar is this to the query" is
// predictable: identical vectors -> similarity 1, opposite -> similarity -1,
// orthogonal -> similarity 0.
const vec = (...values) => values;

const seedChunk = ({ userId, journalId, chunkIndex = 0, embedding, chunkText = 'chunk text' }) =>
  storeEmbedding({
    journalId,
    userId,
    chunkIndex,
    chunkText,
    embedding,
    metadata: { title: 'test' },
  });

describe('VectorRepository.searchSimilar -- tenant isolation', () => {
  test('User A never receives User B\'s chunks, even with an identical embedding and a matching query', async () => {
    const userA = randomUUID();
    const userB = randomUUID();
    const journalA = randomUUID();
    const journalB = randomUUID();

    const sharedEmbedding = vec(1, 0, 0, 0);
    await seedChunk({ userId: userA, journalId: journalA, embedding: sharedEmbedding, chunkText: "A's private entry" });
    await seedChunk({ userId: userB, journalId: journalB, embedding: sharedEmbedding, chunkText: "B's private entry" });

    const resultsForA = await searchSimilar({
      queryEmbedding: sharedEmbedding,
      authenticatedUserId: userA,
      topK: 10,
    });

    assert.equal(resultsForA.length, 1);
    assert.equal(resultsForA[0].journalId, journalA);

    const resultsForB = await searchSimilar({
      queryEmbedding: sharedEmbedding,
      authenticatedUserId: userB,
      topK: 10,
    });

    assert.equal(resultsForB.length, 1);
    assert.equal(resultsForB[0].journalId, journalB);

    // Cross-check: nothing in A's results points at B's journal, or vice versa.
    assert.ok(!resultsForA.some((r) => r.journalId === journalB));
    assert.ok(!resultsForB.some((r) => r.journalId === journalA));
  });

  test('a user with no chunks at all gets an empty result, not another tenant\'s', async () => {
    const userWithData = randomUUID();
    const userWithNoData = randomUUID();
    const journalId = randomUUID();
    const embedding = vec(0, 1, 0, 0);

    await seedChunk({ userId: userWithData, journalId, embedding });

    const results = await searchSimilar({
      queryEmbedding: embedding,
      authenticatedUserId: userWithNoData,
      topK: 10,
    });

    assert.deepEqual(results, []);
  });

  test('refuses to run without an authenticatedUserId, rather than perform an unscoped search', async () => {
    await assert.rejects(
      () => searchSimilar({ queryEmbedding: vec(1, 0), authenticatedUserId: undefined, topK: 5 }),
      /authenticatedUserId/
    );
  });
});

describe('VectorRepository.searchSimilar -- ranking and options', () => {
  test('topK limits the number of results, ranked most-similar first', async () => {
    const userId = randomUUID();
    const journalId = randomUUID();
    const query = vec(1, 0, 0);

    // similarity to query, descending: chunk 0 = 1.0, chunk 1 = ~0.707, chunk 2 = 0.0
    await seedChunk({ userId, journalId, chunkIndex: 0, embedding: vec(1, 0, 0) });
    await seedChunk({ userId, journalId, chunkIndex: 1, embedding: vec(1, 1, 0) });
    await seedChunk({ userId, journalId, chunkIndex: 2, embedding: vec(0, 1, 0) });

    const results = await searchSimilar({ queryEmbedding: query, authenticatedUserId: userId, topK: 2 });

    assert.equal(results.length, 2);
    assert.equal(results[0].chunkIndex, 0);
    assert.equal(results[1].chunkIndex, 1);
    assert.ok(results[0].similarity >= results[1].similarity);
  });

  test('similarityThreshold excludes weakly-related chunks', async () => {
    const userId = randomUUID();
    const journalId = randomUUID();

    await seedChunk({ userId, journalId, chunkIndex: 0, embedding: vec(1, 0, 0) }); // similarity 1.0 to query
    await seedChunk({ userId, journalId, chunkIndex: 1, embedding: vec(0, 1, 0) }); // similarity 0.0 to query

    const results = await searchSimilar({
      queryEmbedding: vec(1, 0, 0),
      authenticatedUserId: userId,
      topK: 10,
      similarityThreshold: 0.5,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].chunkIndex, 0);
  });
});

describe('VectorRepository.deleteJournalEmbeddings', () => {
  test('removes only the target journal\'s chunks, scoped to the owning user', async () => {
    const userId = randomUUID();
    const journalToDelete = randomUUID();
    const journalToKeep = randomUUID();

    await seedChunk({ userId, journalId: journalToDelete, embedding: vec(1, 0) });
    await seedChunk({ userId, journalId: journalToKeep, embedding: vec(1, 0) });

    await deleteJournalEmbeddings({ userId, journalId: journalToDelete });

    const remaining = await searchSimilar({ queryEmbedding: vec(1, 0), authenticatedUserId: userId, topK: 10 });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].journalId, journalToKeep);
  });
});

describe('RAG observability logs', () => {
  test('logs vector-search lifecycle events with ids/counts only, never chunk text', async () => {
    const userId = randomUUID();
    const journalId = randomUUID();
    const secretText = `SECRET_CHUNK_${Date.now()}_do-not-log-me`;

    const stored = await seedChunk({ userId, journalId, embedding: vec(1, 0), chunkText: secretText });
    const chunkId = stored[0].id;

    const originalLog = console.log;
    const captured = [];
    console.log = (...args) => captured.push(args.join(' '));

    try {
      await searchSimilar({ queryEmbedding: vec(1, 0), authenticatedUserId: userId, topK: 5 });
    } finally {
      console.log = originalLog;
    }

    const joined = captured.join('\n');
    assert.match(joined, /\[RAG\].*VECTOR_SEARCH_STARTED/);
    assert.match(joined, /\[RAG\].*AUTHENTICATED_USER/);
    assert.match(joined, new RegExp(`userId=${userId}`));
    assert.match(joined, /\[RAG\].*RETRIEVED_CHUNKS/);
    assert.match(joined, /count=1/);
    assert.match(joined, /\[RAG\].*SOURCE_IDS/);
    assert.ok(joined.includes(chunkId), 'source chunk id should be logged');

    assert.ok(!joined.includes(secretText), 'raw chunk/journal content must never be logged');
  });
});
