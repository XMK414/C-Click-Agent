// scripts/build-common.mjs
//
// The actual build pipeline (tsc, static-asset copies, preload/renderer
// bundling), parameterized by output directory. Shared by scripts/build-e2e.mjs
// (outDir: dist-e2e, used by the Playwright lane) and scripts/build.mjs
// (outDir: dist, used by electron-builder packaging, slice 1.9) — the two
// outputs need to be byte-identical in structure, so this is one
// implementation, not two copies that can drift.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildApp(outDirName) {
  const outDir = resolve(repoRoot, outDirName);

  console.log(`[${outDirName}] tsc -> ${outDir}`);
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
    // The compiled native addon (slice 1.8) — tsc never touches binaries, and
    // windows.ts's requireAddon() resolves it relative to ITS OWN compiled
    // location, so without this copy this build can never find it and
    // silently (if correctly) degrades to the mock bridge. Absent entirely on
    // non-Windows or before `npm run build:native:win` — the existsSync guard
    // below skips it, same as every other optional copy in this list.
    ['app/platform/native/build', 'app/platform/native/build'],
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
  console.log(`[${outDirName}] esbuild preload.ts -> CommonJS (sandboxed preload cannot use ESM)`);
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

  // Renderer entry points loaded via <script type="module" src="...js"> in a
  // file:// page can resolve RELATIVE imports fine (that's how overlay.ts's
  // local-only dependency graph always worked), but cannot resolve a bare npm
  // specifier like "zod" — browsers have no node_modules resolution. panel.ts
  // now imports app/ipc/schemas.ts (for automationProposalSchema), which
  // imports zod, so tsc's plain per-file ESM output breaks it at runtime with
  // "Failed to resolve module specifier 'zod'". Bundle both renderer entry
  // points so any current or future npm dependency is inlined rather than left
  // as an unresolvable bare specifier.
  console.log(`[${outDirName}] esbuild overlay.ts + panel.ts -> bundled ESM (browser cannot resolve bare npm specifiers)`);
  await esbuild.build({
    entryPoints: [resolve(repoRoot, 'app/overlay/overlay.ts'), resolve(repoRoot, 'app/panel/panel.ts')],
    outdir: outDir,
    outbase: repoRoot, // preserves the app/overlay/... and app/panel/... prefix in the output path
    entryNames: '[dir]/[name]',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome120',
    // schemas.ts (imported by panel.ts) intentionally imports key-token constants
    // from platform/key-tokens.ts, NOT platform/index.ts (slice 1.8) — index.ts
    // also selects/loads the native Windows bridge (a real .node require +
    // node:module's createRequire), and neither is resolvable for a browser
    // target. No `external` override here on purpose: if a future change
    // reintroduces that path, this build should fail loudly rather than emit a
    // renderer bundle with an unresolvable import that only breaks at runtime.
    logLevel: 'info',
  });

  console.log(`[${outDirName}] done`);
}
