// tests/platform/mock.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockBridge, type MockBridge } from '../../app/platform/mock.js';
import { createPlatformBridge, UnsupportedPlatformError } from '../../app/platform/index.js';

describe('mock platform bridge', () => {
  let bridge: MockBridge;
  beforeEach(() => { bridge = createMockBridge({ x: 5, y: 5 }); });

  it('reports and updates cursor position', () => {
    expect(bridge.getCursorPos()).toEqual({ x: 5, y: 5 });
    bridge.moveCursor({ x: 10, y: 20 });
    expect(bridge.getCursorPos()).toEqual({ x: 10, y: 20 });
  });

  it('records calls for assertions', () => {
    bridge.click('left');
    bridge.focusWindow('Settings');
    const fns = bridge.calls.map((c) => c.fn);
    expect(fns).toContain('click');
    expect(fns).toContain('focusWindow');
  });

  it('enforces the key whitelist (same guard as real bridges)', () => {
    expect(() => bridge.sendKeys(['CTRL', 'SHIFT', 'ESC'])).not.toThrow();
    expect(() => bridge.sendKeys(['CTRL', 'rm -rf /'])).toThrow(/disallowed/i);
  });

  it('returns a deterministic capture buffer', async () => {
    const buf = await bridge.captureScreen('active-window');
    expect(buf.toString('utf8')).toBe('mock-capture:active-window');
  });

  it('reset clears state', () => {
    bridge.moveCursor({ x: 99, y: 99 });
    bridge.reset();
    expect(bridge.getCursorPos()).toEqual({ x: 5, y: 5 });
    // getCursorPos itself records one call after reset
    expect(bridge.calls.length).toBe(1);
  });
});

describe('createPlatformBridge selector', () => {
  it('throws typed error until native addons are built', () => {
    expect(() => createPlatformBridge('win32')).toThrow(UnsupportedPlatformError);
    expect(() => createPlatformBridge('darwin')).toThrow(UnsupportedPlatformError);
    expect(() => createPlatformBridge('linux')).toThrow(UnsupportedPlatformError);
  });
});
