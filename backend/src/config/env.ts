import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AI_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32).default('dev-secret-change-in-production-min-32-chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/comm_readiness'),
  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().default(5),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_TAB_SWITCH_LIMIT: z.coerce.number().int().min(1).default(4),
  MAX_REPLAY_COUNT: z.coerce.number().int().min(1).default(2),
  MAX_QUESTIONS_PER_SESSION: z.coerce.number().int().min(1).default(5),
  // Optional — required for audio turn caching (M1 sessionContextService).
  // Provide redis://localhost:6379 for local dev; Upstash URL for cloud.
  // If unset, session context caching is disabled but audio turns still work.
  REDIS_URL: z.string().url().optional(),
});

export const env = schema.parse(process.env);
