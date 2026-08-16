/** Standalone migration runner: `npm run db:migrate` */
import 'dotenv/config';
import { loadConfig } from '../src/config/env';
import { createDatabase } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabase(config.DATABASE_URL);
  try {
    const applied = await runMigrations(database.pool);
    if (applied.length === 0) {
      console.log('Database schema is up to date.');
    } else {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
  } finally {
    await database.pool.end();
  }
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
