import { startMockSupabaseServer } from '../tests/helpers/mockSupabaseServer.js';
import { startMockEmbeddingServer } from '../tests/helpers/mockEmbeddingServer.js';
import http from 'node:http';

/**
 * Standalone Development Server:
 * Runs the backend with full in-memory Supabase (Auth + DB + pgvector RPC),
 * Embeddings, and an intelligent context-aware LLM mock.
 * 
 * Perfect for zero-configuration UI testing and offline evaluation!
 */
const startSmartLLMServer = () => {
  const server = http.createServer(async (req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        // ignore
      }

      const messages = body.messages || [];
      const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
      const userMessage = messages.find((m) => m.role === 'user')?.content || '';

      // Check if context was retrieved
      const contextMatch = systemMessage.match(/CONTEXT:\s*([\s\S]*)$/);
      const context = contextMatch ? contextMatch[1].trim() : '';

      let replyContent = '';
      if (!context || context.includes('(No journal context found)')) {
        replyContent = 'I could not find the answer to that in your journal entries.';
      } else {
        // Extract clean text from retrieved context
        const cleanContext = context.replace(/--- Journal Entry \[\d+\] ---\n/g, '').trim();
        replyContent = `Based on your journal entries: ${cleanContext}`;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/chat/completions') {
        res.end(
          JSON.stringify({
            model: body.model || 'smart-mock-llama-3',
            choices: [{ message: { role: 'assistant', content: replyContent }, finish_reason: 'stop' }],
          })
        );
      } else {
        res.end(
          JSON.stringify({
            model: body.model || 'smart-mock-llama-3',
            message: { role: 'assistant', content: replyContent },
            done: true,
            done_reason: 'stop',
          })
        );
      }
    });
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

async function main() {
  console.log('[STANDALONE] Starting local in-memory Supabase & AI services...');
  
  const mockSupabase = await startMockSupabaseServer();
  const mockEmbedding = await startMockEmbeddingServer({ dimension: 8 });
  const mockLLM = await startSmartLLMServer();

  process.env.PORT = '5000';
  process.env.NODE_ENV = 'development';
  process.env.SUPABASE_URL = mockSupabase.url;
  process.env.SUPABASE_ANON_KEY = 'mock-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

  process.env.EMBEDDING_PROVIDER = 'openai';
  process.env.EMBEDDING_BASE_URL = mockEmbedding.url;
  process.env.EMBEDDING_API_KEY = 'mock-key';
  process.env.EMBEDDING_MODEL = 'mock-embedding';
  process.env.EMBEDDING_DIMENSION = '8';

  process.env.LLM_PROVIDER = 'openrouter';
  process.env.LLM_BASE_URL = mockLLM.url;
  process.env.LLM_API_KEY = 'mock-key';
  process.env.LLM_MODEL_NAME = 'meta-llama/llama-3.1-8b-instruct:free';

  // Import app and start listening
  const { default: server } = await import('./server.js');
  console.log('[STANDALONE] Ready! Open http://localhost:5173 to test in your browser with zero configuration.');
}

main().catch(console.error);
