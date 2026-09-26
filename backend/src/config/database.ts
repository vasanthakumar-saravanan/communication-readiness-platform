import { Pool } from 'pg';
import { env } from './env';

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
  // Supabase (and most cloud Postgres providers) require SSL.
  // rejectUnauthorized:false is safe for Supabase — certs are valid but may not
  // be in Node.js's default CA bundle on some platforms.
  ssl: env.NODE_ENV !== 'development' ? { rejectUnauthorized: false } : undefined,
});

db.on('connect', () => {
  if (env.NODE_ENV === 'development') {
    console.log('[db] pool connected');
  }
});
