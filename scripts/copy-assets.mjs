// Copies non-TypeScript assets (SQL migrations + static images) into the build output.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(root, '..');

// SQL migrations
const srcMigrations = path.join(base, 'src', 'db', 'migrations');
const destMigrations = path.join(base, 'dist', 'src', 'db', 'migrations');
mkdirSync(destMigrations, { recursive: true });
cpSync(srcMigrations, destMigrations, { recursive: true });
console.log(`copied SQL migrations -> ${destMigrations}`);

// Static assets (NEXO logo)
if (existsSync(path.join(base, 'assets'))) {
  const destAssets = path.join(base, 'dist', 'assets');
  mkdirSync(destAssets, { recursive: true });
  cpSync(path.join(base, 'assets'), destAssets, { recursive: true });
  console.log(`copied assets -> ${destAssets}`);
}
