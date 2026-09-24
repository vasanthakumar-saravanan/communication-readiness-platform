import 'dotenv/config';
import { Client } from 'pg';
import fs from 'fs/promises';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('[migrate] connected to database');

  try {
    // Bootstrap: system schema must exist before migration 002 runs
    await client.query(`CREATE SCHEMA IF NOT EXISTS system`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS system.migrations (
        id          SERIAL PRIMARY KEY,
        filename    VARCHAR(255) UNIQUE NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM system.migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`[migrate] skip  ${file}`);
        continue;
      }
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] apply ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO system.migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }

    console.log(`[migrate] done — ${count} migration(s) applied`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('[migrate] error:', err.message);
  process.exit(1);
});
