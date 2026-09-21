import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Supabase
  SUPABASE_URL: z.string().optional().default('https://placeholder.supabase.co'),
  SUPABASE_ANON_KEY: z.string().optional().default('placeholder-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default('placeholder-service-role-key'),

  // Auth / JWT
  JWT_SECRET: z.string().optional().default('development-secret-change-in-production-min-32-chars'),

  // LLM Provider
  LLM_PROVIDER: z.enum(['openrouter', 'ollama']).default('openrouter'),
  LLM_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  LLM_API_KEY: z.string().optional().default(''),
  LLM_MODEL_NAME: z.string().default('meta-llama/llama-3.1-8b-instruct:free'),

  // Embedding Provider
  EMBEDDING_PROVIDER: z.enum(['openai', 'ollama', 'openrouter']).default('openai'),
  EMBEDDING_BASE_URL: z.string().default('https://api.openai.com/v1'),
  EMBEDDING_API_KEY: z.string().optional().default(''),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  EMBEDDING_DIMENSION: z.coerce.number().default(1536),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[FATAL] Invalid environment configuration:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
