/**
 * Minimal, dependency-free SQL migration runner.
 *
 * Migration files live in ./migrations (or dist/src/db/migrations after a
 * build) and are applied in filename order inside a transaction. Applied
 * versions are recorded in `schema_migrations` so runs are idempotent and
 * safe to execute on every process start.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';

export async function runMigrations(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    throw new Error(`Migrations directory not found: ${dir}`);
  }

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.version));

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      appliedNow.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      client.release();
    }
  }
  return appliedNow;
}
