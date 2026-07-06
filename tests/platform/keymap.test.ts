// tests/platform/keymap.test.ts

import { describe, it, expect } from 'vitest';
import { ALLOWED_KEY_TOKENS } from '../../app/platform/key-tokens.js';
import {
  TOKEN_TO_VK,
  MODIFIER_TOKENS,
  everyAllowedTokenIsMapped,
  vkFor,
} from '../../app/platform/keymap.js';

describe('keymap — no drift between whitelist and VK table', () => {
  it('EVERY whitelisted token has a VK mapping (a token can never be allowed but unmapped)', () => {
    const { ok, missing } = everyAllowedTokenIsMapped();
    expect(missing, `unmapped tokens: ${missing.join(', ')}`).toEqual([]);
    expect(ok).toBe(true);
  });

  it('does not map anything outside the whitelist (no stray entries widen the surface)', () => {
    for (const token of Object.keys(TOKEN_TO_VK)) {
      expect(ALLOWED_KEY_TOKENS.has(token), `stray VK entry: ${token}`).toBe(true);
    }
  });

  it('modifiers are a subset of the whitelist', () => {
    for (const m of MODIFIER_TOKENS) expect(ALLOWED_KEY_TOKENS.has(m)).toBe(true);
  });
});

describe('keymap — VK correctness spot-checks (Win32 winuser.h values)', () => {
  it('letters and digits use their ASCII code points', () => {
    expect(vkFor('A')).toBe(0x41);
    expect(vkFor('Z')).toBe(0x5a);
    expect(vkFor('0')).toBe(0x30);
    expect(vkFor('9')).toBe(0x39);
  });

  it('common control keys map to the documented VK codes', () => {
    expect(vkFor('ENTER')).toBe(0x0d);
    expect(vkFor('ESC')).toBe(0x1b);
    expect(vkFor('TAB')).toBe(0x09);
    expect(vkFor('CTRL')).toBe(0x11);
    expect(vkFor('SHIFT')).toBe(0x10);
    expect(vkFor('ALT')).toBe(0x12);
    expect(vkFor('F1')).toBe(0x70);
    expect(vkFor('F12')).toBe(0x7b);
  });

  it('WIN/META/CMD all resolve to the Left-Win key on Windows', () => {
    expect(vkFor('WIN')).toBe(0x5b);
    expect(vkFor('META')).toBe(0x5b);
    expect(vkFor('CMD')).toBe(0x5b);
  });

  it('vkFor throws for an unmapped token', () => {
    expect(() => vkFor('PAUSE')).toThrow(/No VK mapping/);
  });
});
