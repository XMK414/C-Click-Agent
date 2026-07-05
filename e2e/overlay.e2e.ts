// e2e/overlay.e2e.ts — runtime assertions the manual docs/demo-P1.md checklist
// used to require a human for. Converts "needs your eyes" into a CI gate.

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './harness.js';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

test('overlay window options: transparent, frameless, always-on-top, no rounded corners, click-through', async () => {
  const info = await launched.app.evaluate(() => globalThis.__ccE2E?.windows.overlay);
  expect(info).toBeDefined();
  expect(info!.transparent).toBe(true);
  expect(info!.frame).toBe(false);
  expect(info!.alwaysOnTop).toBe(true);
  expect(info!.roundedCorners).toBe(false);
  expect(info!.ignoreMouseEvents).toEqual({ called: true, ignore: true, forward: true });
});

test('overlay security flags: contextIsolation, sandbox, no nodeIntegration', async () => {
  const info = await launched.app.evaluate(() => globalThis.__ccE2E?.windows.overlay);
  expect(info!.webPreferences).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
});

test('overlay renderer isolation: no Node globals, bridge exposes only the named overlay methods', async () => {
  const result = await launched.overlay.evaluate(() => {
    const bridge = (window as unknown as { clickclick?: Record<string, unknown> }).clickclick;
    return {
      hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
      hasModule: typeof (window as unknown as { module?: unknown }).module !== 'undefined',
      hasProcess: typeof (window as unknown as { process?: unknown }).process !== 'undefined',
      bridgeKeys: bridge ? Object.keys(bridge).sort() : null,
      hasRawIpc: bridge ? 'ipcRenderer' in bridge || 'send' in bridge || 'invoke' in bridge : null,
    };
  });
  expect(result.hasRequire).toBe(false);
  expect(result.hasModule).toBe(false);
  expect(result.hasProcess).toBe(false);
  expect(result.bridgeKeys).toEqual(['onCursor', 'onGuidance', 'onState']);
  expect(result.hasRawIpc).toBe(false);
});

test('overlay CSP actually blocks an injected inline script from executing', async () => {
  await launched.overlay.evaluate(() => {
    (window as unknown as { __cspProbe?: boolean }).__cspProbe = false;
    const script = document.createElement('script');
    script.textContent = 'window.__cspProbe = true;';
    document.body.appendChild(script);
  });
  // Give any (unexpectedly successful) execution a tick to land.
  await launched.overlay.waitForTimeout(50);
  const probe = await launched.overlay.evaluate(() => (window as unknown as { __cspProbe?: boolean }).__cspProbe);
  expect(probe).toBe(false);
});

test('buddy cursor mirrors fed positions (change-detected)', async () => {
  await launched.app.evaluate(({ }, [x, y]) => globalThis.__ccE2E?.feedCursor(x, y), [111, 222] as [number, number]);
  await expect(launched.overlay.locator('#buddy-cursor')).toHaveJSProperty(
    'style.transform',
    'translate(111px, 222px)',
  );
});

test('all 6 cursor states cycle in order via the dev/e2e hook', async () => {
  const expected = ['idle', 'listening', 'thinking', 'executing', 'success', 'error'];
  for (const state of expected) {
    await launched.app.evaluate(() => globalThis.__ccE2E?.triggerNextState());
    await expect(launched.overlay.locator('#buddy-cursor')).toHaveAttribute('data-state', state);
  }
});

test('zero console errors/warnings and zero page errors across launch + one interaction', async () => {
  await launched.app.evaluate(() => globalThis.__ccE2E?.feedCursor(50, 60));
  await launched.overlay.waitForTimeout(100);

  const bad = launched.consoleMessages.filter((m) => m.type === 'error' || m.type === 'warning');
  expect(bad, JSON.stringify(bad)).toEqual([]);
  expect(launched.pageErrors, JSON.stringify(launched.pageErrors)).toEqual([]);
});
