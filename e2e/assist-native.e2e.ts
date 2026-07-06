// e2e/assist-native.e2e.ts — slice 1.8, the end-to-end proof that
// model/task -> confirmation -> REAL OS input works, and that nothing fires
// without an approved proposal. Distinct from e2e/assist.e2e.ts (slice 2.3),
// which proves the same confirm flow against the MOCK bridge; this file only
// means something when the real native bridge is loaded, so it self-skips
// off-Windows and whenever the addon isn't built (degradedToMock) — the
// generic `e2e` CI job (which never builds native) exercises the confirm
// flow via assist.e2e.ts instead, and simply no-ops here.
//
// Runs for real only in the `native-windows` CI lane, after
// `npm run build:native:win`.

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './harness.js';

const onWindows = process.platform === 'win32';

let launched: LaunchedApp;

test.beforeEach(async () => {
  test.skip(!onWindows, 'exercises the real native input bridge — Windows only');
  launched = await launchApp({ realBridge: true });
  const degraded = await launched.app.evaluate(() => globalThis.__ccE2E?.isDegradedToMock());
  test.skip(degraded !== false, 'native addon not built in this run — see native-windows CI lane');
});

test.afterEach(async () => {
  if (launched) await closeApp(launched);
});

function proposeClick(app: LaunchedApp['app'], point: { x: number; y: number }): Promise<string | null | undefined> {
  const action = { actionType: 'click', point, clickType: 'left', description: 'assist e2e (native)' };
  return app.evaluate(({}, a) => globalThis.__ccE2E?.proposeAction(a as never, 'task'), action);
}

async function approve(panel: LaunchedApp['panel']): Promise<void> {
  const confirm = panel.locator('#confirm');
  await expect(confirm).toBeVisible();
  await confirm.locator('button', { hasText: 'Approve' }).click();
  await expect(confirm).toBeHidden();
}

test('approving a click proposal moves the REAL cursor to the target point', async () => {
  const before = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());
  const target = { x: 300, y: 300 };

  const proposalId = await proposeClick(launched.app, target);
  expect(proposalId).toEqual(expect.any(String));

  // Nothing executes pre-approval: the real cursor must not have moved yet.
  const stillBefore = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());
  expect(stillBefore).toEqual(before);

  await approve(launched.panel);

  // Absolute normalization + DPI rounding can shift by a couple px (same tolerance as
  // the native smoke test's moveCursor round-trip).
  await expect
    .poll(async () => {
      const p = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());
      return p ? Math.round(Math.hypot(p.x - target.x, p.y - target.y)) : Number.POSITIVE_INFINITY;
    }, { timeout: 5_000 })
    .toBeLessThanOrEqual(3);
});

test('the kill switch halts real input: an approved proposal after halt() never moves the cursor', async () => {
  // Land the cursor at a known point first so a post-halt "no movement" assertion is meaningful.
  const parked = { x: 300, y: 300 };
  await proposeClick(launched.app, parked);
  await approve(launched.panel);
  await expect
    .poll(async () => {
      const p = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());
      return p ? Math.round(Math.hypot(p.x - parked.x, p.y - parked.y)) : Number.POSITIVE_INFINITY;
    }, { timeout: 5_000 })
    .toBeLessThanOrEqual(3);
  const parkedPos = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());

  await launched.app.evaluate(() => globalThis.__ccE2E?.haltKillSwitch());

  const target = { x: 700, y: 500 }; // a different point — would prove movement if it fired
  const proposalId = await proposeClick(launched.app, target);
  expect(proposalId).toEqual(expect.any(String));
  await approve(launched.panel); // panel still approves — the HALT must stop it downstream, not the UI

  const after = await launched.app.evaluate(() => globalThis.__ccE2E?.getCursorPos());
  expect(after).toEqual(parkedPos); // unchanged — the halted switch refused the injection

  await launched.app.evaluate(() => globalThis.__ccE2E?.resumeKillSwitch());
});
