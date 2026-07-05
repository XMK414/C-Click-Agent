// gateway/policy/tos-manifest.ts
//
// Signed ToS manifest client (plan FS-C). Operationalizes template Appendix C's
// "ToS crawler" for a local-first desktop app: the app fetches a SIGNED manifest
// (provider -> tosVersion + questionsVersion) and verifies it against a PINNED
// ed25519 public key before trusting a single byte. ZERO key material ever touches
// the manifest endpoint. The manifest is what drives evaluatePass() invalidation.
//
// The verify + parse path is pure and fully testable (see tests). The https fetch
// + <=30-day offline cache is documented below and lands when the endpoint exists.

import { verify as edVerify, createPublicKey } from 'node:crypto';
import { z } from 'zod';
import type { ManifestEntry } from './critical-tos-gate.js';

/**
 * PINNED public key. This is the TEST key that signed the committed fixture.
 * PRODUCTION: replace with the real endpoint's public key (the private half lives
 * only on Kyle's signing infra -- never in this repo). Rotating the key is a
 * deliberate, reviewed change to this constant.
 */
export const PINNED_MANIFEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAyviE6gwDMhX/OusyTW6txtVZuSt1n4lK1iMe0bExVl8=
-----END PUBLIC KEY-----`;

const manifestSchema = z.object({
  manifestVersion: z.number().int().positive(),
  issuedAt: z.string().min(1),
  entries: z
    .array(
      z.object({
        provider: z.string().min(1),
        tosVersion: z.string().min(1),
        questionsVersion: z.string().min(1),
      }),
    )
    .min(1),
});

export type SignedManifest = z.infer<typeof manifestSchema>;

export class ManifestSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestSignatureError';
  }
}

/**
 * Verify an ed25519 signature over the EXACT manifest bytes, then parse. Fails
 * closed: a bad signature, wrong key, or malformed body all throw rather than
 * returning partial data. Callers must treat a throw as "no trustworthy manifest".
 */
export function verifyAndParseManifest(
  rawBytes: Buffer,
  signatureB64: string,
  publicKeyPem: string = PINNED_MANIFEST_PUBLIC_KEY,
): ManifestEntry[] {
  const key = createPublicKey(publicKeyPem);
  let ok = false;
  try {
    ok = edVerify(null, rawBytes, key, Buffer.from(signatureB64, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new ManifestSignatureError('manifest signature verification failed');

  const parsed = manifestSchema.safeParse(JSON.parse(rawBytes.toString('utf8')));
  if (!parsed.success) {
    throw new ManifestSignatureError(
      `manifest body invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  return parsed.data.entries.map((e) => ({
    provider: e.provider,
    tosVersion: e.tosVersion,
    questionsVersion: e.questionsVersion,
  }));
}

/** Look up one provider's live entry from a verified manifest. */
export function entryFor(entries: ManifestEntry[], provider: string): ManifestEntry | undefined {
  return entries.find((e) => e.provider === provider);
}

// ---------------------------------------------------------------------------
// TODO (slice 1.6, once the endpoint exists -- a Kyle task, ~30 min):
//   async function fetchManifest(url): Promise<ManifestEntry[]>
//     - GET the signed manifest + signature over https
//     - verifyAndParseManifest(bytes, sig)
//     - cache to disk; honor last-known <=30 days offline, then warn + soft-lock
//       NEW gate passes (existing passes keep their version binding -- edge case)
// Until then, dev/offline loads the committed signed fixture (see tests).
// ---------------------------------------------------------------------------
