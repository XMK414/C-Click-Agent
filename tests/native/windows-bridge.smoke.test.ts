// tests/native/windows-bridge.smoke.test.ts
//
// Runs ONLY on Windows (auto-skips elsewhere via runIf), so it lives in the normal test
// tree yet never breaks the Linux core lane. On windows-latest CI (after
// `npm run build:native:win`) it proves the compiled addon loads, exports exactly the
// six methods, and that a read-only + a round-trip call actually work against the OS.
//
// Destructive surface (click / real keystrokes) is intentionally NOT exercised broadly
// here — the assist e2e drives those against a disposable test window. This smoke test
// stays to safe, observable operations.

import { describe, it, expect } from 'vitest';
import { requireAddon, type WindowsNativeAddon } from '../../app/platform/windows.js';

const onWindows = process.platform === 'win32';

describe.runIf(onWindows)('windows-bridge native addon (windows-latest only)', () => {
  let addon: WindowsNativeAddon;

  it('loads the compiled .node addon', () => {
    addon = requireAddon(); // requires `npm run build:native:win` to have produced the binary
    expect(addon).toBeTruthy();
  });

  it('exports EXACTLY the six PlatformBridge methods — no wider surface', () => {
    const keys = Object.keys(addon).sort();
    expect(keys).toEqual(
      ['captureScreen', 'click', 'focusWindow', 'getCursorPos', 'moveCursor', 'sendKeys'].sort(),
    );
  });

  it('getCursorPos returns a plausible on-screen coordinate (read-only)', () => {
    const p = addon.getCursorPos();
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('moveCursor round-trips: moving then reading back lands ~the target (DPI tolerance)', () => {
    const target = { x: 400, y: 300 };
    addon.moveCursor(target.x, target.y);
    const p = addon.getCursorPos();
    // Absolute normalization + DPI rounding can shift by a couple px; allow a small window.
    expect(Math.abs(p.x - target.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(p.y - target.y)).toBeLessThanOrEqual(3);
  });

  it('rejects an out-of-range VK in sendKeys (native defense-in-depth guard)', () => {
    // 0x07 is not in the generated allowed-VK set → native must refuse.
    expect(() => addon.sendKeys([0x07], [])).toThrow();
  });

  it('captureScreen returns a non-empty base64 PNG string', () => {
    const b64 = addon.captureScreen(false);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(100);
    // PNG magic bytes (\x89PNG) base64-encode to a prefix of "iVBORw0KGgo".
    expect(b64.startsWith('iVBORw0KGgo')).toBe(true);
  });
});

// Sanity: on non-Windows this file contributes zero running tests but still imports cleanly.
describe.skipIf(onWindows)('windows-bridge smoke (skipped off-Windows)', () => {
  it('is correctly skipped on this platform', () => {
    expect(onWindows).toBe(false);
  });
});
