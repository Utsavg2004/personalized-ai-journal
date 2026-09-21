# Architecture & System Design

This document details the architectural principles, component responsibilities, data flow, and design trade-offs implemented in the **Personalized AI Journal (RAG MVP)**.

---

## 1. Architectural Principles

1. **Defense-in-Depth Multi-Tenancy**: Tenant isolation is enforced at both the application layer (server-injected `user_id`) and the database layer (PostgreSQL Row-Level Security).
2. **Provider Agnosticism**: AI capabilities (embeddings, chat completions) are shielded behind clean interface abstractions, allowing providers to be swapped via configuration with zero changes to core business logic.
3. **Fail-Closed & Atomic Rollbacks**: If vector embedding fails during journal creation, the created journal row is deleted (compensating rollback), ensuring the vector store never falls out of sync with journal entries.
4. **Data Privacy & Zero Secret Leakage**: User journal text, raw vector arrays, and external API keys are strictly excluded from logging streams and client error responses.
5. **Simplicity for Maintainability**: The architecture is designed to be clear and approachable for developers with ~2 years of full-stack experience, avoiding unnecessary microservice overhead.

---

## 2. System Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                                   │
│  React 19 + Vite Application                                               │
│  - AuthContext (Session state, JWT storage)                                │
│  - Journal UI (Create, Edit, Paginate, Delete)                             │
│  - Chat UI (Conversational RAG assistant, source attribution)              │
│  - Centralized API Service (Automatic Bearer Token Injection)              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ HTTP / JSON / Bearer Auth
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              API / APP TIER                                │
│  Express.js Server (Node.js 20+)                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Middlewares: Helmet, CORS, RateLimiter, RequestLogger, ErrorHandler  │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Controllers & Routes:                                                │  │
│  │ - /api/health       (Health & Readiness Probes)                      │  │
│  │ - /api/auth         (Register, Login, Me, Logout)                    │  │
│  │ - /api/journals     (CRUD with Zod payload validation)               │  │
│  │ - /api/chat         (RAG question answering & conversation save)     │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Services Layer:                                                      │  │
│  │ - JournalService     (Orchestrates CRUD + chunking + embedding)      │  │
│  │ - RAGService         (Query embedding -> Vector search -> Prompt)    │  │
│  │ - EmbeddingService   (Batch text embedding generation)               │  │
│  │ - LLMService         (Provider abstraction: OpenRouter & Ollama)     │  │
│  │ - ConversationService(Thread isolation & message persistence)        │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Repositories Layer:                                                  │  │
│  │ - JournalRepository (Tenant-scoped database queries on `journals`)   │  │
│  │ - VectorRepository  (Tenant-scoped similarity search via RPC)        │  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 │                                         │
                 ▼                                         ▼
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│          DATABASE TIER           │      │        AI PROVIDER TIER          │
│  Supabase / PostgreSQL           │      │  Embedding Drivers:              │
│  - GoTrue Auth (User identities) │      │  - OpenAI-Compatible API         │
│  - `journals` Table              │      │                                  │
│  - `journal_chunks` (pgvector)   │      │  LLM Drivers:                    │
│  - `conversations` Table         │      │  - OpenRouter API (Cloud)        │
│  - Row-Level Security (RLS)      │      │  - Ollama API (Local / Offline)  │
│  - `match_journal_chunks` RPC    │      │                                  │
└──────────────────────────────────┘      └──────────────────────────────────┘
```

---

## 3. Data Flow

### A. Journal Ingestion Flow
1. **Client Request**: `POST /api/journals` with `{ title, content }` + Bearer JWT.
2. **Auth & Validation**: `requireAuth` validates JWT; `createJournalSchema` validates payload.
3. **Row Insertion**: `JournalRepository.insertJournal` writes row to `journals` table.
4. **Sliding-Window Chunking**: `chunkText(content)` splits text into 800-character windows with 150-character overlaps snapping to whitespace boundaries.
5. **Vector Generation**: `EmbeddingService.embedTexts(chunks)` sends batch request to embedding provider.
6. **Vector Storage**: `VectorRepository.storeEmbedding` writes chunk rows with embeddings to `journal_chunks`.
7. **Compensating Rollback**: If step 5 or 6 fails, the created journal row and any partial chunks are purged, returning HTTP 502.

### B. Journal Update Flow
1. **Client Request**: `PATCH /api/journals/:id` with `{ title, content }`.
2. **Row Update**: `JournalRepository.updateJournalForUser` updates the journal row.
3. **Vector Invalidation**: `VectorRepository.deleteJournalEmbeddings` purges previous chunks.
4. **Re-Embedding**: New chunks and embeddings are generated and stored, preventing stale search results.

### C. RAG Chat Query Flow
1. **Client Request**: `POST /api/chat` with `{ message, conversationId }`.
2. **Embedding**: The user's query is converted to a dense vector via `EmbeddingService`.
3. **Tenant Similarity Search**: PostgreSQL executes `match_journal_chunks(query_embedding, match_user_id, topK)` using cosine distance.
4. **Prompt Construction**: Retrieved chunks are injected into the system prompt as immutable reference data with strict anti-hallucination instructions.
5. **Inference**: Configured LLM driver (OpenRouter or Ollama) produces the completion within a 30s timeout window.
6. **Response Formatting**: Server returns `{ answer, sources: [{ journalId, title, similarity, chunkIndex }], conversationId }`.
