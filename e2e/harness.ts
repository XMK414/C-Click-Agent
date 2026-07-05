// e2e/harness.ts — Playwright-Electron launch helper.
//
// Drives the REAL, transpiled app (dist-e2e/app/main.js — see
// scripts/build-e2e.mjs) via Playwright's Electron API. This is what turns
// the manual docs/demo-P1.md checklist into a CI gate: runtime properties like
// click-through, renderer isolation, and CSP enforcement only exist once
// Electron is actually running, not in jsdom/unit tests.

import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const MAIN_ENTRY = resolve(process.cwd(), 'dist-e2e/app/main.js');

export interface ConsoleEntry {
  type: string;
  text: string;
  source: 'overlay' | 'panel';
}

export interface PageErrorEntry {
  error: Error;
  source: 'overlay' | 'panel';
}

export interface LaunchedApp {
  app: ElectronApplication;
  overlay: Page;
  panel: Page;
  consoleMessages: ConsoleEntry[];
  pageErrors: PageErrorEntry[];
  dataDir: string;
}

export interface LaunchOptions {
  /** Defaults to true — sets CC_E2E=1 so main.ts exposes the introspection/control hook. */
  e2e?: boolean;
}

function identify(page: Page): 'overlay' | 'panel' {
  return page.url().includes('panel.html') ? 'panel' : 'overlay';
}

/** Launches the real app with both windows open, wired console/error collectors. */
export async function launchApp(options: LaunchOptions = {}): Promise<LaunchedApp> {
  const e2e = options.e2e ?? true;
  // Hermetic per-launch data dir — without this, gate passes minted by one test
  // run persist into the next (and into a real user's actual app-data location).
  const dataDir = mkdtempSync(resolve(tmpdir(), 'cc-e2e-'));
  const app = await electron.launch({
    args: [MAIN_ENTRY],
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: 'test',
      CC_DATA_DIR: dataDir,
      ...(e2e ? { CC_E2E: '1' } : { CC_E2E: '' }),
    },
  });

  const first = await app.waitForEvent('window');
  const second = await app.waitForEvent('window');
  const pages = [first, second];
  await Promise.all(pages.map((p) => p.waitForLoadState('domcontentloaded')));

  const overlay = pages.find((p) => identify(p) === 'overlay');
  const panel = pages.find((p) => identify(p) === 'panel');
  if (!overlay || !panel) {
    throw new Error('expected exactly one overlay window and one panel window');
  }

  const consoleMessages: ConsoleEntry[] = [];
  const pageErrors: PageErrorEntry[] = [];
  for (const page of [overlay, panel]) {
    const source = identify(page);
    page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text(), source }));
    page.on('pageerror', (error) => pageErrors.push({ error, source }));
  }

  return { app, overlay, panel, consoleMessages, pageErrors, dataDir };
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  await launched.app.close();
  rmSync(launched.dataDir, { recursive: true, force: true });
}
