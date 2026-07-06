// e2e/assist.e2e.ts — slice 2.3, the confirm-flow proven end-to-end in the
// real panel window: main mints a proposal, the panel renders the CONCRETE
// action, and only an explicit Approve reaches the (mock) PlatformBridge.

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './harness.js';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

const sampleAction = {
  actionType: 'focus',
  targetWindowTitle: 'Settings',
  description: 'A scripted task wants to bring Settings to the foreground.',
};

test('approving a proposal in the real panel window executes it exactly once on the mock bridge', async () => {
  const proposalId = await launched.app.evaluate(
    ({}, action) => globalThis.__ccE2E?.proposeAction(action as never, 'task'),
    sampleAction,
  );
  expect(proposalId).toEqual(expect.any(String));

  const confirm = launched.panel.locator('#confirm');
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Focus window "Settings"');
  await expect(confirm).toContainText(sampleAction.description);

  await confirm.locator('button', { hasText: 'Approve' }).click();
  await expect(confirm).toBeHidden();

  await expect
    .poll(() => launched.app.evaluate(() => globalThis.__ccE2E?.getBridgeCalls()))
    .toEqual([{ fn: 'focusWindow', args: ['Settings'] }]);
});

test('denying a proposal never reaches the bridge', async () => {
  await launched.app.evaluate(({}, action) => globalThis.__ccE2E?.proposeAction(action as never, 'model'), sampleAction);

  const confirm = launched.panel.locator('#confirm');
  await expect(confirm).toBeVisible();
  await confirm.locator('button', { hasText: 'Deny' }).click();
  await expect(confirm).toBeHidden();

  const calls = await launched.app.evaluate(() => globalThis.__ccE2E?.getBridgeCalls());
  expect(calls).toEqual([]);
});

test('Approve/Deny buttons are within the actual window bounds a real mouse can reach', async () => {
  // Playwright's .click() dispatches to an element's DOM coordinates via CDP
  // regardless of whether those coordinates fall within the OS window's real,
  // clipped pixel bounds — a structural blind spot for fixed-size Electron
  // windows. This test catches what the other assist.e2e.ts tests can't: it
  // asserts the buttons' bounding boxes are actually inside the panel window's
  // content rect, the same box a physical mouse is confined to.
  await launched.app.evaluate(
    ({}, action) => globalThis.__ccE2E?.proposeAction(action as never, 'task'),
    sampleAction,
  );

  const confirm = launched.panel.locator('#confirm');
  await expect(confirm).toBeVisible();

  const bounds = await launched.app.evaluate(() => globalThis.__ccE2E?.getPanelContentBounds());
  expect(bounds).toBeDefined();

  for (const label of ['Approve', 'Deny']) {
    const box = await confirm.locator('button', { hasText: label }).boundingBox();
    expect(box, `${label} button should be rendered`).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.height);
  }
});

test('a resubmitted decision for the same proposal cannot execute a second time', async () => {
  const proposalId = await launched.app.evaluate(
    ({}, action) => globalThis.__ccE2E?.proposeAction(action as never, 'mcp'),
    sampleAction,
  );

  const confirm = launched.panel.locator('#confirm');
  await expect(confirm).toBeVisible();
  await confirm.locator('button', { hasText: 'Approve' }).click();
  await expect.poll(() => launched.app.evaluate(() => globalThis.__ccE2E?.getBridgeCalls()?.length)).toBe(1);

  // Directly replay the same proposalId as if the renderer resent it — the
  // registry already consumed it once, so this must be a no-op.
  await launched.panel.evaluate((id) => {
    (window as unknown as { clickclickPanel: { decide(id: string, approved: boolean): void } }).clickclickPanel.decide(
      id as string,
      true,
    );
  }, proposalId);
  await launched.panel.waitForTimeout(100);

  const calls = await launched.app.evaluate(() => globalThis.__ccE2E?.getBridgeCalls());
  expect(calls).toHaveLength(1); // still just once
});
