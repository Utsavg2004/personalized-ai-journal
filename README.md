# Personalized AI Journal with Retrieval-Augmented Generation (RAG)

A production-grade, secure, multi-tenant AI Journaling web application built for the **Codeacious Technologies Assignment**. The platform empowers users to write, organize, and manage personal journal entries, while providing an AI chat assistant whose knowledge is strictly and deterministically grounded in each user's own journal history.

---

## 1. Project Overview

The **Personalized AI Journal** combines modern web development with a Retrieval-Augmented Generation (RAG) pipeline to offer contextual self-reflection. When a user queries the assistant, the system embeds the query, executes a tenant-scoped cosine similarity search across their stored journal entries using PostgreSQL `pgvector`, and constructs a prompt ensuring the LLM answers strictly based on retrieved journal context.

Multi-tenancy and data privacy are enforced at every level—from verified JSON Web Tokens (JWT) at the API boundary, down to Row-Level Security (RLS) policies in PostgreSQL.

---

## 2. Features

- **User Authentication**: Secure signup, login, session persistence, and logout powered by Supabase GoTrue Auth.
- **Journal CRUD**: Create, read, paginate, update, and delete journal entries with real-time word/character handling.
- **Automatic Chunking & Vectorization**: Sliding-window text chunking with token overlap and automatic embedding generation upon journal creation and editing.
- **Vector Store Invalidation & Cleanup**: Zero stale vectors—updating a journal re-indexes its vectors, and deleting a journal cascades deletions to all vector chunks.
- **Semantic Similarity Search**: Sub-second top-K vector search powered by PostgreSQL `pgvector` and an IVFFlat index.
- **Strictly Grounded RAG Chat**: Context-grounded conversational AI that refuses outside knowledge for personal journal queries, prevents hallucination, and resists prompt injection.
- **Source Citations**: Chat responses include full source metadata with journal titles, chunk indices, and similarity confidence scores.
- **Pluggable LLM Providers**: Seamless switching between cloud providers (**OpenRouter**) and local offline models (**Ollama**) via configuration with zero code changes.
- **Hardened Security**: Helmet protection, rate limiting on auth and chat routes, CORS whitelisting, and structured logging with zero sensitive text exposure.

---

## 3. Tech Stack

- **Backend**: Node.js (v20+), Express.js (ES Modules)
- **Database & Vector Store**: Supabase, PostgreSQL 15+, `pgvector` extension
- **Authentication**: GoTrue Auth (JWT)
- **AI & Embeddings**: OpenAI-compatible embedding models (`text-embedding-3-small`), OpenRouter API (`meta-llama/llama-3.1-8b-instruct`), Ollama (`llama3.2` / `llama3.1`)
- **Frontend**: React 19, Vite, React Router DOM, Vanilla CSS Design System
- **Validation**: Zod
- **Testing**: Node.js native test runner (`node:test`), Supertest
- **Security & Utilities**: Helmet, CORS, Express-Rate-Limit, Dotenv

---

## 4. Architecture

```
                                  ┌────────────────────────┐
                                  │  React Frontend (Vite) │
                                  └───────────┬────────────┘
                                              │ HTTP / Bearer JWT
                                              ▼
                                  ┌────────────────────────┐
                                  │   Express API Server   │
                                  │ (Auth, Journals, Chat) │
                                  └─────┬───────┬──────────┘
                                        │       │
                     ┌──────────────────┘       └──────────────────┐
                     ▼                                             ▼
       ┌───────────────────────────┐                 ┌───────────────────────────┐
       │   Supabase / PostgreSQL   │                 │     AI Provider Layer     │
       │  - GoTrue Auth (JWT)      │                 │  - Embeddings (OpenAI)    │
       │  - Journals Table (RLS)   │                 │  - LLM Factory:           │
       │  - journal_chunks (vector)│                 │    * OpenRouter API       │
       │  - match_journal_chunks() │                 │    * Local Ollama API     │
       └───────────────────────────┘                 └───────────────────────────┘
```

---

## 5. Folder Structure

```
Codeacious/
├── backend/
│   ├── src/
│   │   ├── config/              # Environment variables & Supabase clients
│   │   ├── controllers/         # Request handling (Auth, Journals, Chat, Health)
│   │   ├── middleware/          # Auth, Error handling, Rate limiting, Validation
│   │   ├── repositories/        # Database access (journals, vector store)
│   │   ├── routes/              # Express route declarations
│   │   ├── services/            # Business logic (RAG, Journal, LLM, Embedding, Conversation)
│   │   │   ├── embeddingProviders/ # Embedding client abstraction
│   │   │   └── llmProviders/       # LLM client abstraction (OpenRouter, Ollama)
│   │   ├── utils/               # Chunking, Logging, Errors
│   │   ├── validators/          # Zod request validation schemas
│   │   ├── app.js               # Express application configuration
│   │   └── server.js            # Server entry point
│   ├── tests/                   # Automated test suites (64 tests across 18 suites)
│   │   ├── helpers/             # In-memory mock servers (Supabase, LLM, Embeddings)
│   │   ├── auth, chat, embedding, health, journal, llm, rag, vectorSearch tests
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/          # JournalList, JournalForm, ChatInterface, ProtectedRoute
│   │   ├── context/             # AuthContext (state & session management)
│   │   ├── pages/               # Login, Register, Dashboard
│   │   ├── services/            # Centralized API client with auth interceptors
│   │   ├── App.jsx, index.css, main.jsx
│   ├── package.json
│   └── vite.config.js
├── supabase/
│   └── migrations/              # SQL schema, RLS policies, match_journal_chunks RPC
├── docs/                        # Architecture, RAG flow, Security, Compliance docs
└── package.json                 # Root script runner
```

---

## 6. Database Schema

### `journals` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, Default `gen_random_uuid()` | Unique journal entry identifier |
| `user_id` | `uuid` | Foreign Key → `auth.users(id)` ON DELETE CASCADE | Owning user ID |
| `title` | `text` | NOT NULL, Default `''` | Journal title |
| `content` | `text` | NOT NULL, Default `''` | Journal text content |
| `created_at` | `timestamptz` | NOT NULL, Default `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, Default `now()` | Last modification timestamp |

### `journal_chunks` Table (Vector Store)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, Default `gen_random_uuid()` | Unique chunk identifier |
| `journal_id` | `uuid` | Foreign Key → `journals(id)` ON DELETE CASCADE | Associated journal entry |
| `user_id` | `uuid` | Foreign Key → `auth.users(id)` ON DELETE CASCADE | Owning user ID |
| `chunk_index` | `integer` | NOT NULL, Default `0` | Sequence index of chunk |
| `chunk_text` | `text` | NOT NULL | Raw text content of chunk |
| `embedding` | `vector(1536)` | Index: `ivfflat (vector_cosine_ops)` | Dense semantic vector |
| `metadata` | `jsonb` | NOT NULL, Default `'{}'` | Context metadata (`title`, `chunkCount`) |
| `created_at` | `timestamptz` | NOT NULL, Default `now()` | Creation timestamp |

### `conversations` Table
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | Primary Key, Default `gen_random_uuid()` | Unique conversation ID |
| `user_id` | `uuid` | Foreign Key → `auth.users(id)` ON DELETE CASCADE | Owning user ID |
| `title` | `text` | Default `''` | Conversation title |
| `created_at` | `timestamptz` | NOT NULL, Default `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, Default `now()` | Last update timestamp |

---

## 7. Authentication

- **Provider**: Supabase GoTrue Auth issuing signed JSON Web Tokens (JWT).
- **Backend Verification**: `auth.middleware.js` intercepts requests with `Authorization: Bearer <token>`, verifies the signature with Supabase GoTrue, and attaches the authenticated user object to `req.user`.
- **Identity Integrity**: `req.user.id` is the **only** source of identity. Any client-provided `user_id` in request payloads or URL queries is strictly ignored and discarded.

---

## 8. Multi-Tenancy

The application enforces strict **logical multi-tenancy**:
1. All users share the same database tables (`journals`, `journal_chunks`, `conversations`).
2. Every table row is partitioned by `user_id`.
3. Application code enforces tenant filtering in every SQL query and stored procedure invocation.
4. Database-level Row-Level Security (RLS) acts as a secondary defense-in-depth shield.

---

## 9. Data Isolation

- **Zero Cross-Tenant Leakage**: Queries in repositories always include `.eq('user_id', authenticatedUserId)`.
- **IDOR Protection**: Attempting to read, update, or delete another user's journal or conversation ID returns a safe `404 Not Found` (preventing attackers from discovering whether an ID exists).
- **Vector Isolation**: The `match_journal_chunks` RPC requires `match_user_id` as a mandatory parameter and evaluates `WHERE jc.user_id = match_user_id` before computing vector similarities.

---

## 10. Embeddings

- **Provider Abstraction**: Single entry point `embedding.service.js` with swappable underlying drivers (`openAICompatibleProvider`).
- **Batch Processing**: Text chunks are embedded in batches via `/v1/embeddings` to minimize HTTP overhead.
- **Model**: Default `text-embedding-3-small` (1536 dimensions) or configurable local embedding models.

---

## 11. pgvector

- Enabled via `CREATE EXTENSION IF NOT EXISTS vector;`.
- Distance Metric: **Cosine Distance** (`<=>`), converted to cosine similarity via `1 - (jc.embedding <=> query_embedding)`.
- Indexing: `CREATE INDEX idx_journal_chunks_embedding ON journal_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);` for high-throughput similarity searches.

---

## 12. RAG Pipeline

The Retrieval-Augmented Generation pipeline follows a deterministic 7-step lifecycle:
1. **Request Intake**: User sends `{ message, conversationId }` to `POST /api/chat`.
2. **Session Verification**: `requireAuth` validates the Bearer token and extracts `userId`.
3. **Query Embedding**: `embedText(question)` converts the user's question into a 1536-dimensional vector.
4. **Vector Retrieval**: `searchSimilar` executes `match_journal_chunks` for `userId`, retrieving the top-K chunks above the similarity threshold.
5. **Prompt Assembly**: The retrieved chunks are formatted as data blocks within a strict system prompt instructing the model to answer only from context.
6. **LLM Inference**: The LLM abstraction invokes OpenRouter or Ollama with a 30-second timeout.
7. **Response & Attribution**: Returns the grounded answer accompanied by structured source metadata (`journalId`, `similarity`, `chunkIndex`, `title`).

---

## 13. Chunking Strategy

Implemented in `backend/src/utils/chunkText.js`:
- **Target Chunk Size**: 800 characters.
- **Chunk Overlap**: 150 characters.
- **Natural Boundary Snapping**: Chunk boundaries search forward up to 80 characters for whitespace to prevent word truncation.
- **Single-Chunk Optimization**: Entries under 800 characters remain a single chunk without redundant splitting.

---

## 14. LLM Abstraction

The LLM abstraction (`llm.service.js` and `llmProviders/index.js`) exposes a unified interface:
```typescript
generateCompletion({
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
  temperature?: number,
  maxTokens?: number,
  timeoutMs?: number
}): Promise<{ content: string, model: string, finishReason: string | null }>
```
Switching between OpenRouter and Ollama requires changing a single environment variable (`LLM_PROVIDER=openrouter|ollama`) with **zero changes** to RAG or application logic.

---

## 15. OpenRouter

- **Endpoint**: `https://openrouter.ai/api/v1/chat/completions`
- **Default Model**: `meta-llama/llama-3.1-8b-instruct:free` (a free-tier alias, `openrouter/free`, also works)
- **Error Handling**: Captures HTTP 429 rate limits, extracts `Retry-After` headers, and surfaces them as typed `RateLimitError`.
- **Switching to it**: `backend/.env.example` ships with Ollama as the active `LLM_PROVIDER` and a commented-out `LLM - OpenRouter` block right below it. Get a free API key from [openrouter.ai/keys](https://openrouter.ai/keys), then in `backend/.env` comment out the four Ollama `LLM_*` lines and uncomment the OpenRouter ones — no other code changes are required.

---

## 16. Ollama

- **Endpoint**: `http://localhost:11434/api/chat`
- **Recommended Model**: `llama3.2` or `llama3.1:8b`
- **Mode**: Non-streaming (`stream: false`) returning complete JSON completions.
- **Full Guide**: See [docs/ollama-configuration.md](file:///c:/Users/abcom/Desktop/Project/Codeacious/docs/ollama-configuration.md).

---

## 17. Environment Variables

Create `backend/.env` based on `.env.example`:

```dotenv
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Embedding Provider
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=https://openrouter.ai/api/v1
EMBEDDING_API_KEY=your-embedding-key
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# LLM Provider (openrouter or ollama)
LLM_PROVIDER=ollama
LLM_BASE_URL=http://localhost:11434
LLM_API_KEY=ollama
LLM_MODEL_NAME=llama3.2

# LLM - OpenRouter (alternative to Ollama above)
# Comment out the Ollama LLM_* lines and uncomment these to run the LLM
# through OpenRouter's cloud API instead. Get a free key at
# https://openrouter.ai/keys
# LLM_PROVIDER=openrouter
# LLM_BASE_URL=https://openrouter.ai/api/v1
# LLM_API_KEY=sk-or-v1-your-openrouter-key-here
# LLM_MODEL_NAME=openrouter/free

# Conversation History
ENABLE_CONVERSATION_HISTORY=true
```

---

## 18. Setup Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Utsavg2004/personalized-ai-journal.git
   cd personalized-ai-journal
   ```
2. **Install All Dependencies**:
   ```bash
   npm run install:all
   ```

---

## 19. Database Migration Instructions

1. Open your **Supabase Dashboard** → **SQL Editor**.
2. Paste the contents of `supabase/migrations/20260921000001_initial_schema.sql`.
3. Click **Run**.
4. Confirm tables (`journals`, `journal_chunks`, `conversations`) and function `match_journal_chunks` are created.

---

## 20. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm run dev
```
The server will start on `http://localhost:3000`.

---

## 21. Frontend Setup

```bash
cd frontend
npm run dev
```
The client will start on `http://localhost:5173`.

---

## 22. Testing

The backend includes a comprehensive automated test suite with **64 tests across 18 test suites** utilizing in-memory mock servers (no real API keys required):

```bash
npm run test:backend
```

### Coverage Overview:
- `auth.test.js`: Registration, login, bad credentials, token expiry.
- `journal.test.js`: Tenant CRUD, pagination, validation, rollback on embedding failure.
- `vectorSearch.test.js`: Cosine similarity, score thresholds, tenant isolation.
- `rag.test.js`: Context grounding, anti-hallucination, cross-tenant isolation.
- `chat.test.js`: End-to-end chat flow, conversation authorization.
- `llm.test.js`: OpenRouter, Ollama, provider switching, error translation.
- `embedding.test.js`: Sliding-window chunking, vector storage, privacy logging.

### 🎥 1–3 Minute Live Demo Flow:
1. **Start Backend & Frontend**: Run `npm run dev:backend` and `npm run dev:frontend`.
2. **Register/Login**: Navigate to `http://localhost:5173/register` and create an account.
3. **Write Journal Entry**: Create a journal titled *"Tech Stack Decisions"* containing *"We selected Supabase pgvector for vector search and OpenRouter for LLM inference."* Click **Save**.
4. **Ask Grounded Question**: In the AI Chat, ask *"What did we select for vector search?"* Observe answer referencing `pgvector` with source attribution.
5. **Test Anti-Hallucination**: Ask *"What is the capital of France?"* Observe answer: *"I could not find the answer to that in your journal entries."*
6. **Switch to Ollama**: Change `LLM_PROVIDER=ollama` in `.env` and verify seamless local offline execution.

---

## 23. API Overview

| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/health` | No | Server health status & uptime |
| `GET` | `/api/ready` | No | Server readiness probe |
| `POST` | `/api/auth/register` | Rate-Limited | Register a new user |
| `POST` | `/api/auth/login` | Rate-Limited | Authenticate user & receive JWT |
| `POST` | `/api/auth/logout` | Yes | Invalidate user session |
| `GET` | `/api/auth/me` | Yes | Fetch current user profile |
| `POST` | `/api/journals` | Yes | Create journal & trigger vector embedding |
| `GET` | `/api/journals` | Yes | Paginate user's journals (`?page=1&pageSize=10`) |
| `GET` | `/api/journals/:id` | Yes | Get specific journal entry |
| `PATCH` | `/api/journals/:id` | Yes | Update journal entry & re-index vectors |
| `DELETE`| `/api/journals/:id` | Yes | Delete journal entry & purge vector chunks |
| `POST` | `/api/chat` | Yes + Rate-Limited | Execute RAG pipeline and return grounded answer |

---

## 24. Security

- **IDOR Protection**: All database queries enforce `user_id = authenticatedUserId`. Foreign IDs return 404.
- **Log Sanitization**: Sensitive journal text and embedding vectors are stripped from server logs.
- **Network Timeouts**: Upstream LLM and embedding requests have hard 30-second `AbortController` timeouts.
- **Rate Limiting**: Auth endpoints (10/15m) and Chat endpoint (20/1m) protected against abuse.
- **CORS & Headers**: Strict CORS origin whitelisting and Helmet security headers enabled.

---

## 25. Known Limitations

- **Streaming Responses**: Chat responses currently return in batch (full completion) rather than Server-Sent Events (SSE) streaming.
- **File Uploads**: Supports plain text and Markdown input; direct PDF/DOCX parsing is not included in the MVP.

---

## 26. Future Improvements

1. **SSE Streaming**: Stream LLM tokens incrementally to the frontend for lower perceived latency.
2. **Hybrid Search**: Combine pgvector dense similarity search with PostgreSQL full-text search (`tsvector`) via Reciprocal Rank Fusion (RRF).
3. **Graph Memory**: Extract entities and emotional sentiment trajectories across journal entries over time.
4. **Export & Encryption**: Client-side end-to-end encryption (E2EE) option for private journal entries before vector ingestion.
