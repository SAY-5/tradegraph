/*
 * What a visitor downloads. Measures the bundled output in dist/ and fails if it grows past
 * the ceiling, so the page's weight is a checked number rather than an impression.
 *
 *   npm run build && npm run weight
 *
 * Both figures are printed: the bytes on disk and the bytes gzip produces, which is what a
 * static host serves. The slice dominates the payload, so the ceiling is set just above the
 * current total rather than at a round number that would hide a doubling.
 */

import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');

/** Raw bytes and gzip bytes for everything the bundler wrote. */
const RAW_CEILING = 1_100_000;
const GZIP_CEILING = 300_000;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
  process.stdout.write('dist/ is missing; run npm run build first\n');
  process.exit(1);
}

let raw = 0;
let gzip = 0;
const rows: string[] = [];
for (const path of files(DIST).sort()) {
  const bytes = readFileSync(path);
  const zipped = gzipSync(bytes, { level: 9 }).length;
  raw += bytes.length;
  gzip += zipped;
  rows.push(`  ${relative(DIST, path).padEnd(28)} ${String(bytes.length).padStart(8)} B  `
    + `${String(zipped).padStart(8)} B gzip`);
}

process.stdout.write(`dist/ contents\n${rows.join('\n')}\n`);
process.stdout.write(`\ntotal ${raw} B on disk, ${gzip} B gzip `
  + `(${(raw / 1024).toFixed(0)} KiB, ${(gzip / 1024).toFixed(0)} KiB)\n`);

const failures: string[] = [];
if (raw > RAW_CEILING) failures.push(`raw ${raw} B is over the ${RAW_CEILING} B ceiling`);
if (gzip > GZIP_CEILING) failures.push(`gzip ${gzip} B is over the ${GZIP_CEILING} B ceiling`);

if (failures.length > 0) {
  process.stdout.write(`\nFAIL ${failures.join('; ')}\n`);
  process.exit(1);
}
process.stdout.write(`ok   within ${RAW_CEILING} B on disk and ${GZIP_CEILING} B gzip\n`);
