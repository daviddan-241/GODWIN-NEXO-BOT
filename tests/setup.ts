/** Global test setup. */
import { config } from 'dotenv';

// Load .env.test if present (never committed).
config({ path: '.env.test', quiet: true });
config({ path: '.env', quiet: true });

process.env.TZ = 'UTC';
