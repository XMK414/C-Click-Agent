// e2e/panel.e2e.ts — runtime assertions for the panel window, plus the gate
// quiz UX driven against the app's OWN real gateway.
//
// Note on "stubbed local gateway (fixture packs)": by the time this harness
// landed, the real ToS-scan content (gateway/policy/provider-tos-content.ts)
// was already wired in and /gate/quiz|submit never touch the network — so
// this drives the actual running gateway directly rather than layering a
// separate stub in front of it. That's a strictly more faithful e2e than a
// stub would have been.

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './harness.js';
import { PROVIDER_GATE_CONTENT } from '../gateway/policy/provider-tos-content.js';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await closeApp(launched);
});

async function expandPanel(): Promise<void> {
  await launched.panel.locator('#strip').hover();
  await expect(launched.panel.locator('#panel')).toBeVisible();
}

test('panel window options: focusable, NOT click-through (inverse of the overlay)', async () => {
  const info = await launched.app.evaluate(() => globalThis.__ccE2E?.windows.panel);
  expect(info).toBeDefined();
  expect(info!.focusable).toBe(true);
  expect(info!.ignoreMouseEvents).toEqual({ called: false });
});

test('panel security flags: contextIsolation, sandbox, no nodeIntegration', async () => {
  const info = await launched.app.evaluate(() => globalThis.__ccE2E?.windows.panel);
  expect(info!.webPreferences).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
});

test('panel renderer isolation: no Node globals, bridge exposes only the named panel methods', async () => {
  const result = await launched.panel.evaluate(() => {
    const bridge = (window as unknown as { clickclickPanel?: Record<string, unknown> }).clickclickPanel;
    return {
      hasRequire: typeof (window as unknown as { require?: unknown }).require !== 'undefined',
      hasModule: typeof (window as unknown as { module?: unknown }).module !== 'undefined',
      bridgeKeys: bridge ? Object.keys(bridge).sort() : null,
      hasRawIpc: bridge ? 'ipcRenderer' in bridge || 'send' in bridge : null,
    };
  });
  expect(result.hasRequire).toBe(false);
  expect(result.hasModule).toBe(false);
  expect(result.bridgeKeys).toEqual(
    ['askAgent', 'decide', 'getGateStatus', 'getProviders', 'getQuiz', 'onPanelState', 'onProposal', 'submitQuiz'].sort(),
  );
  expect(result.hasRawIpc).toBe(false);
});

test('panel CSP actually blocks an injected inline script from executing', async () => {
  await launched.panel.evaluate(() => {
    (window as unknown as { __cspProbe?: boolean }).__cspProbe = false;
    const script = document.createElement('script');
    script.textContent = 'window.__cspProbe = true;';
    document.body.appendChild(script);
  });
  await launched.panel.waitForTimeout(50);
  const probe = await launched.panel.evaluate(() => (window as unknown as { __cspProbe?: boolean }).__cspProbe);
  expect(probe).toBe(false);
});

test('panel is genuinely clickable (accepts a click, unlike the overlay)', async () => {
  await expandPanel();
  await launched.panel.locator('#provider').click();
  // No throw = the click landed; a click-through window would never let this focus.
  await expect(launched.panel.locator('#provider')).toBeFocused();
});

test('gate quiz UX end-to-end: real warning + redacted questions, wrong then right answers', async () => {
  await expandPanel();
  await launched.panel.locator('#provider').selectOption('anthropic');

  const prompt = launched.panel.locator('#prompt');
  await prompt.fill('help me');
  await prompt.press('Enter');

  const gateContainer = launched.panel.locator('#gate-container');
  await expect(gateContainer.locator('form')).toBeVisible();

  const warningText = await gateContainer.locator('.cc-gate-warning').textContent();
  expect(warningText).toBe(PROVIDER_GATE_CONTENT.anthropic!.warning);

  const domAndBridgeText = await launched.panel.evaluate(async () => {
    const quiz = await (window as unknown as { clickclickPanel: { getQuiz(p: string): Promise<unknown> } })
      .clickclickPanel.getQuiz('anthropic');
    return JSON.stringify(quiz) + document.getElementById('gate-container')!.textContent;
  });
  expect(domAndBridgeText).not.toContain('correctIndex');

  // Submit deliberately wrong answers (every real question's correctIndex is 1; pick 0).
  const radios = gateContainer.locator('input[type="radio"][value="0"]');
  const radioCount = await radios.count();
  for (let i = 0; i < radioCount; i += 1) {
    await radios.nth(i).check();
  }
  await gateContainer.locator('button[type="submit"]').click();

  await expect(gateContainer.locator('.cc-gate-failed')).toBeVisible();
  const failedText = await gateContainer.locator('.cc-gate-failed').textContent();
  expect(failedText).not.toContain('correctIndex');

  // Retake -> answer correctly this time, looking up the real correctIndex by question id.
  await gateContainer.locator('button', { hasText: 'Retake' }).click();
  await expect(gateContainer.locator('form')).toBeVisible();

  const questionIds = await gateContainer.locator('fieldset').evaluateAll((fieldsets) =>
    fieldsets.map((f) => f.querySelector('input[type="radio"]')?.getAttribute('name')),
  );
  const correctById = new Map(PROVIDER_GATE_CONTENT.anthropic!.pack.questions.map((q) => [q.id, q.correctIndex]));
  for (const id of questionIds) {
    if (!id) continue;
    const correctIndex = correctById.get(id)!;
    await gateContainer.locator(`input[type="radio"][name="${id}"][value="${correctIndex}"]`).check();
  }
  await gateContainer.locator('button[type="submit"]').click();

  await expect(gateContainer.locator('.cc-gate-unlocked')).toBeVisible();
  await expect(gateContainer.locator('.cc-gate-unlocked')).toHaveText('Unlocked.');
});
