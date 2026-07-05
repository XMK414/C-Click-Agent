// tests/gateway/provider-tos-content.test.ts
//
// Verifies the real ToS gate content (from the 2026-07-04 scan) is complete and
// that the signed manifest fixture hasn't drifted from it — editing content
// without re-signing the manifest must fail loudly, never silently pass.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_GATE_CONTENT, SCANNED_MANIFEST_ENTRIES } from '../../gateway/policy/provider-tos-content.js';
import { verifyAndParseManifest, entryFor } from '../../gateway/policy/tos-manifest.js';

const LAUNCH_PROVIDERS = ['openrouter', 'openai', 'anthropic'] as const;

describe('PROVIDER_GATE_CONTENT — completeness', () => {
  it.each(LAUNCH_PROVIDERS)('%s has at least one question and non-empty warning + breakdownUrl', (provider) => {
    const content = PROVIDER_GATE_CONTENT[provider];
    expect(content).toBeDefined();
    expect(content!.pack.questions.length).toBeGreaterThanOrEqual(1);
    expect(content!.warning.length).toBeGreaterThan(0);
    expect(content!.breakdownUrl.length).toBeGreaterThan(0);
  });
});

describe('content <-> manifest parity (drift guard)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtureDir = resolve(here, '../../gateway/policy/fixtures');
  const manifestBytes = readFileSync(resolve(fixtureDir, 'tos-manifest.json'));
  const signature = readFileSync(resolve(fixtureDir, 'tos-manifest.json.sig'), 'utf8').trim();

  it('every scanned entry matches the signed fixture exactly', () => {
    const liveEntries = verifyAndParseManifest(manifestBytes, signature);
    for (const scanned of SCANNED_MANIFEST_ENTRIES) {
      const live = entryFor(liveEntries, scanned.provider);
      expect(live, `manifest fixture is missing provider "${scanned.provider}" — re-sign it`).toBeDefined();
      expect(live!.tosVersion, `tosVersion drift for "${scanned.provider}" — re-sign the manifest`).toBe(
        scanned.tosVersion,
      );
      expect(
        live!.questionsVersion,
        `questionsVersion drift for "${scanned.provider}" — re-sign the manifest`,
      ).toBe(scanned.questionsVersion);
    }
  });
});
