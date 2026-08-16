// Copies non-TypeScript assets (SQL migrations) into the build output.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, '..', 'src', 'db', 'migrations');
const destDir = path.join(root, '..', 'dist', 'src', 'db', 'migrations');

mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });
console.log(`copied SQL migrations -> ${destDir}`);
