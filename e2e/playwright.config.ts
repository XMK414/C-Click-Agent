// e2e/playwright.config.ts — the native/e2e lane, NOT the Electron-free core lane.
//
// Run via `npm run test:e2e` (which first rebuilds dist-e2e/ — see
// package.json's pretest:e2e). Kept out of `npm run verify` entirely.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  fullyParallel: false, // each test launches its own Electron process — keep it simple
  workers: 1, // multiple concurrent Electron instances contend for resources and flake
  retries: 0,
  reporter: [['list']],
});
