// scripts/assert-installer.mjs — slice 1.9.
//
// Crude but real check that `npm run package:win` (or `:mac`) actually
// produced a non-trivially-sized installer, not a silently empty/broken one.
// The deeper check (does the native addon actually ship inside it) is
// tests/packaging/native-addon-ships.test.ts; this is the CI-job-level
// existence+size gate from the kickoff's scope item 5.

import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), 'dist-release');
const MIN_BYTES = 10_000_000; // a real Electron installer is comfortably 60MB+; 10MB is a generous floor

let entries;
try {
  entries = readdirSync(dir);
} catch (err) {
  console.error(`[assert-installer] ${dir} does not exist — packaging did not run`);
  throw err;
}

const candidates = entries.filter((f) => f.endsWith('.exe') || f.endsWith('.dmg'));
if (candidates.length === 0) {
  console.error(`[assert-installer] no .exe/.dmg found in ${dir}`);
  process.exit(1);
}

let ok = true;
for (const file of candidates) {
  const p = resolve(dir, file);
  const { size } = statSync(p);
  console.log(`[assert-installer] ${file}: ${size} bytes`);
  if (size < MIN_BYTES) {
    console.error(
      `[assert-installer] ${file} is suspiciously small (${size} bytes < ${MIN_BYTES}) — packaging may have silently produced a broken artifact`,
    );
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log('[assert-installer] ok');
