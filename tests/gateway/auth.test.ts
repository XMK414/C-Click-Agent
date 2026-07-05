// tests/gateway/auth.test.ts

import { describe, it, expect } from 'vitest';
import {
  generateLaunchToken,
  isValidToken,
  parseBearer,
  authorize,
} from '../../gateway/auth.js';

describe('launch token auth', () => {
  it('generates a high-entropy url-safe token', () => {
    const t = generateLaunchToken();
    expect(t.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('two tokens differ', () => {
    expect(generateLaunchToken()).not.toBe(generateLaunchToken());
  });

  it('validates an exact match and rejects mismatch / wrong type / wrong length', () => {
    const t = generateLaunchToken();
    expect(isValidToken(t, t)).toBe(true);
    expect(isValidToken(t, t + 'x')).toBe(false);
    expect(isValidToken(t, 'short')).toBe(false);
    expect(isValidToken(t, 12345 as unknown)).toBe(false);
  });

  it('parses a Bearer header and rejects malformed ones', () => {
    expect(parseBearer('Bearer abc.def')).toBe('abc.def');
    expect(parseBearer('bearer abc')).toBe('abc');
    expect(parseBearer('Basic abc')).toBeNull();
    expect(parseBearer(undefined)).toBeNull();
  });

  it('authorize() ties it together', () => {
    const t = generateLaunchToken();
    expect(authorize(t, `Bearer ${t}`)).toBe(true);
    expect(authorize(t, `Bearer ${t}tampered`)).toBe(false);
    expect(authorize(t, '')).toBe(false);
  });
});
