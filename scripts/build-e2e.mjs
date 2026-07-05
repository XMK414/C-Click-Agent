// scripts/build-e2e.mjs
//
// Prepares a runnable Electron build for the Playwright e2e lane: transpiles
// the TS sources with tsc, then copies the static overlay/panel assets (html,
// css, svg) that tsc doesn't touch. Output goes to `dist-e2e/`, kept separate
// from any future `dist/` packaging output. Portable (no shell-specific copy
// commands) so it runs the same on Windows, macOS, and Linux CI runners.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'dist-e2e');

console.log('[build-e2e] tsc -> ' + outDir);
// Invoke tsc's own JS entry directly via `node` rather than npx/npx.cmd — avoids
// Windows batch-file spawning quirks (EINVAL) and needs no shell at all.
// tsconfig.json sets noEmit:true (this is a typecheck-only config normally) —
// `--noEmit false` overrides that so this one invocation actually emits JS.
const tscBin = resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.json', '--outDir', outDir, '--noEmit', 'false'], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const copies = [
  ['app/overlay/overlay.html', 'app/overlay/overlay.html'],
  ['app/overlay/styles.css', 'app/overlay/styles.css'],
  ['app/overlay/cursor-states.css', 'app/overlay/cursor-states.css'],
  ['app/overlay/assets', 'app/overlay/assets'],
  ['app/panel/panel.html', 'app/panel/panel.html'],
  ['app/panel/styles.css', 'app/panel/styles.css'],
  // tsc only emits .ts -> .js; the signed manifest fixture is plain data.
  ['gateway/policy/fixtures', 'gateway/policy/fixtures'],
];

for (const [from, to] of copies) {
  const src = resolve(repoRoot, from);
  const dest = resolve(outDir, to);
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
  }
}

// Electron's SANDBOXED preload loader (sandbox:true, mandatory per §7) cannot
// parse ES module `import`/`export` syntax at all — it fails at parse time
// with "Cannot use import statement outside a module," before any of our code
// runs. This is a real bug tsc's plain ESM output ships, not an e2e-only
// concern: without this bundle, window.clickclick/clickclickPanel would never
// be defined in ANY real launch. Bundle preload.ts (+ its one local import,
// ipc/channels.ts) into a single self-contained CommonJS file that requires
// only 'electron', overwriting tsc's ESM output for this one entry point.
console.log('[build-e2e] esbuild preload.ts -> CommonJS (sandboxed preload cannot use ESM)');
const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [resolve(repoRoot, 'app/preload.ts')],
  outfile: resolve(outDir, 'app/preload.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
});

console.log('[build-e2e] done');
