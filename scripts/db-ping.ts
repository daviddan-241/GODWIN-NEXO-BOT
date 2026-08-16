/** Database connectivity check: `npm run db:ping` */
import 'dotenv/config';
import { loadConfig } from '../src/config/env';
import { createDatabase, pingDatabase } from '../src/db/client';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabase(config.DATABASE_URL);
  try {
    await pingDatabase(database);
    const res = await database.pool.query('SELECT version()');
    console.log(`Database OK — ${res.rows[0].version.split(' on ')[0]}`);
  } finally {
    await database.pool.end();
  }
}

main().catch((err) => {
  console.error(`[fatal] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
