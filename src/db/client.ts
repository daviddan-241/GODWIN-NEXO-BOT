/**
 * Database client: a PostgreSQL pool + drizzle instance.
 * The pool is shared across the whole process.
 */
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  pool: Pool;
  db: Db;
}

export function createDatabase(databaseUrl: string): Database {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (err) => {
    // Prevent the process from crashing on idle client errors; the query
    // that triggered it will surface the error to its own caller.
    console.error(`[db] idle client error: ${err.message}`);
  });

  return { pool, db: drizzle(pool, { schema }) };
}

/** One-shot connectivity check (used by the health server and scripts). */
export async function pingDatabase(database: Database): Promise<void> {
  await database.pool.query('SELECT 1');
}
