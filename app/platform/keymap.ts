// app/platform/keymap.ts
//
// Typed accessor over the SINGLE SOURCE OF TRUTH for key-token → Windows VK codes
// (app/platform/vk-map.json). See that file's header for the no-drift rationale.
//
// The native addon does NOT read this file — it includes a C++ header generated from
// the SAME json by scripts/gen-vk-header.mjs. That guarantees the TS whitelist and the
// native VK table are one source: a whitelisted token can never map to the wrong key,
// which on this slice would mean the wrong keystroke injected into the user's machine.

import { ALLOWED_KEY_TOKENS } from './key-tokens.js';
import rawVkMap from './vk-map.json' with { type: 'json' };

/** Modifier tokens are held down around the main key(s) rather than tapped. */
export const MODIFIER_TOKENS: ReadonlySet<string> = new Set(['CTRL', 'ALT', 'SHIFT', 'META', 'WIN', 'CMD']);

/** token -> Win32 Virtual-Key code (the `_comment` metadata key is stripped). */
export const TOKEN_TO_VK: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(rawVkMap as Record<string, unknown>)
      .filter(([k, v]) => !k.startsWith('_') && typeof v === 'number')
      .map(([k, v]) => [k, v as number]),
  ),
);

/** True iff every whitelisted token has a VK mapping. Used by tests + at startup. */
export function everyAllowedTokenIsMapped(): { ok: boolean; missing: string[] } {
  const missing = [...ALLOWED_KEY_TOKENS].filter((t) => !(t in TOKEN_TO_VK));
  return { ok: missing.length === 0, missing };
}

/** Look up a VK code for a token, or throw (native mirrors this via the generated header). */
export function vkFor(token: string): number {
  const vk = TOKEN_TO_VK[token];
  if (vk === undefined) throw new Error(`No VK mapping for token: ${JSON.stringify(token)}`);
  return vk;
}
