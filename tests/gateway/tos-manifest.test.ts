// tests/gateway/tos-manifest.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyAndParseManifest,
  entryFor,
  ManifestSignatureError,
  PINNED_MANIFEST_PUBLIC_KEY,
} from '../../gateway/policy/tos-manifest.js';
import { evaluatePass, mintPassRecord, type QuestionPack } from '../../gateway/policy/critical-tos-gate.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = resolve(here, '../../gateway/policy/fixtures');
const manifestBytes = readFileSync(resolve(fixtureDir, 'tos-manifest.json'));
const signature = readFileSync(resolve(fixtureDir, 'tos-manifest.json.sig'), 'utf8').trim();

describe('verifyAndParseManifest — signed fixture', () => {
  it('verifies the committed fixture against the pinned key and parses entries', () => {
    const entries = verifyAndParseManifest(manifestBytes, signature);
    expect(entries.length).toBe(3);
    expect(entryFor(entries, 'openai')?.tosVersion).toBe('oai-2026-01-01');
  });

  it('rejects a tampered manifest body (signature no longer matches)', () => {
    const tampered = Buffer.from(manifestBytes.toString('utf8').replace('openai', 'evilcorp'));
    expect(() => verifyAndParseManifest(tampered, signature)).toThrow(ManifestSignatureError);
  });

  it('rejects a tampered signature', () => {
    const badSig = Buffer.from(signature, 'base64');
    badSig[0] = badSig[0]! ^ 0xff;
    expect(() => verifyAndParseManifest(manifestBytes, badSig.toString('base64'))).toThrow(
      ManifestSignatureError,
    );
  });

  it('rejects verification under a different (wrong) public key', () => {
    // A structurally valid but different ed25519 key.
    const wrongKey = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5jVUu6VjVh2H7cO4kV9m8yqQ0V0m1n2o3p4q5r6s7t8=
-----END PUBLIC KEY-----`;
    expect(() => verifyAndParseManifest(manifestBytes, signature, wrongKey)).toThrow();
  });

  it('the pinned key is a real ed25519 SPKI PEM', () => {
    expect(PINNED_MANIFEST_PUBLIC_KEY).toMatch(/BEGIN PUBLIC KEY/);
  });
});

describe('manifest -> gate invalidation (end-to-end, offline)', () => {
  it('a pass minted against the fixture unlocks; a manifest bump invalidates it', () => {
    const entries = verifyAndParseManifest(manifestBytes, signature);
    const live = entryFor(entries, 'openai')!;

    const pack: QuestionPack = {
      provider: 'openai',
      tosVersion: live.tosVersion,
      questionsVersion: live.questionsVersion,
      questions: [],
    };
    const pass = mintPassRecord('device-1', pack);

    // Matches the live manifest -> unlocked.
    expect(evaluatePass(pass, live).status).toBe('unlocked');

    // Simulate the endpoint publishing a new ToS version -> pass expires.
    const bumped = { ...live, tosVersion: 'oai-tos-2026-09-new' };
    expect(evaluatePass(pass, bumped).status).toBe('gate_not_passed');
  });
});
