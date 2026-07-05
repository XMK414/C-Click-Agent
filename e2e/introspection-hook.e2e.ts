// e2e/introspection-hook.e2e.ts — proves the test-only hook is genuinely
// gated, not just unused: with CC_E2E unset, it must never populate.

import { test, expect } from '@playwright/test';
import { launchApp, closeApp, type LaunchedApp } from './harness.js';

test('the e2e introspection/control hook is absent when CC_E2E is unset', async () => {
  const launched: LaunchedApp = await launchApp({ e2e: false });
  try {
    const hook = await launched.app.evaluate(() => globalThis.__ccE2E);
    expect(hook).toBeUndefined();
  } finally {
    await closeApp(launched);
  }
});
