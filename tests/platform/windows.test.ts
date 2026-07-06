// tests/platform/windows.test.ts
//
// These assert the security decisions that live in the TS wrapper — the layer that
// runs BEFORE anything reaches the OS. The native addon is faked; display bounds and
// the kill-switch state are injected. This is what makes the injection path safe, and
// it is fully verified here without a Windows machine.

import { describe, it, expect, vi } from 'vitest';
import {
  createWindowsBridge,
  InjectionHaltedError,
  CoordinateOutOfBoundsError,
  type WindowsNativeAddon,
  type DisplayBounds,
} from '../../app/platform/windows.js';
import { createPlatformBridge } from '../../app/platform/index.js';

/** A recording fake for the native addon. */
function fakeAddon(): WindowsNativeAddon & { calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  return {
    calls,
    getCursorPos: () => { calls.push(['getCursorPos', []]); return { x: 3, y: 4 }; },
    moveCursor: (x, y) => { calls.push(['moveCursor', [x, y]]); },
    click: (b) => { calls.push(['click', [b]]); },
    sendKeys: (vks, mods) => { calls.push(['sendKeys', [vks, mods]]); },
    captureScreen: (full) => { calls.push(['captureScreen', [full]]); return Buffer.from('img').toString('base64'); },
    focusWindow: (t) => { calls.push(['focusWindow', [t]]); },
  };
}

const ONE_DISPLAY: DisplayBounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }];

function build(opts: {
  addon?: WindowsNativeAddon;
  displays?: DisplayBounds[];
  halted?: boolean;
  log?: (l: 'info' | 'warn', e: string, d?: Record<string, unknown>) => void;
} = {}) {
  const addon = opts.addon ?? fakeAddon();
  const bridge = createWindowsBridge({
    loadAddon: () => addon,
    getDisplays: () => opts.displays ?? ONE_DISPLAY,
    isInjectionHalted: () => opts.halted ?? false,
    log: opts.log,
  });
  return { bridge, addon };
}

describe('windows wrapper — kill switch gates every injecting method', () => {
  it('moveCursor/click/sendKeys/focusWindow all throw when halted; NOTHING reaches the addon', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon, halted: true });
    expect(() => bridge.moveCursor({ x: 10, y: 10 })).toThrow(InjectionHaltedError);
    expect(() => bridge.click('left')).toThrow(InjectionHaltedError);
    expect(() => bridge.sendKeys(['CTRL', 'A'])).toThrow(InjectionHaltedError);
    expect(() => bridge.focusWindow('X')).toThrow(InjectionHaltedError);
    expect(addon.calls.length).toBe(0); // the OS was never touched
  });

  it('read-only getCursorPos is NOT gated by the kill switch', () => {
    const { bridge } = build({ halted: true });
    expect(bridge.getCursorPos()).toEqual({ x: 3, y: 4 });
  });
});

describe('windows wrapper — coordinate clamping (no off-screen / hidden-target injection)', () => {
  it('rejects a point outside all displays and never calls the addon', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon });
    expect(() => bridge.moveCursor({ x: 5000, y: 5000 })).toThrow(CoordinateOutOfBoundsError);
    expect(addon.calls.find((c) => c[0] === 'moveCursor')).toBeUndefined();
  });

  it('accepts a point inside a display', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon });
    bridge.moveCursor({ x: 100, y: 200 });
    expect(addon.calls).toContainEqual(['moveCursor', [100, 200]]);
  });

  it('honors multi-monitor bounds (a point valid only on the second display)', () => {
    const displays: DisplayBounds[] = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ];
    const addon = fakeAddon();
    const { bridge } = build({ addon, displays });
    bridge.moveCursor({ x: 2500, y: 500 }); // only on display 2
    expect(addon.calls).toContainEqual(['moveCursor', [2500, 500]]);
  });
});

describe('windows wrapper — sendKeys re-validation + VK/modifier split', () => {
  it('rejects a disallowed token BEFORE the addon (defense in depth)', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon });
    expect(() => bridge.sendKeys(['CTRL', 'rm -rf /'])).toThrow(/Disallowed key token/);
    expect(addon.calls.find((c) => c[0] === 'sendKeys')).toBeUndefined();
  });

  it('splits modifiers from keys and passes VK codes (Ctrl+Shift+A)', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon });
    bridge.sendKeys(['CTRL', 'SHIFT', 'A']);
    const call = addon.calls.find((c) => c[0] === 'sendKeys')!;
    const [keys, mods] = call[1] as [number[], number[]];
    expect(mods.sort()).toEqual([0x10, 0x11]); // SHIFT, CTRL
    expect(keys).toEqual([0x41]); // A
  });
});

describe('windows wrapper — click + capture + focus passthrough', () => {
  it('maps click types to native button codes', () => {
    const addon = fakeAddon();
    const { bridge } = build({ addon });
    bridge.click('left'); bridge.click('right'); bridge.click('middle');
    expect(addon.calls.filter((c) => c[0] === 'click').map((c) => c[1][0])).toEqual([0, 1, 2]);
  });

  it('captureScreen returns a Buffer decoded from the native base64', async () => {
    const { bridge } = build();
    const buf = await bridge.captureScreen('active-window');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString('utf8')).toBe('img');
  });
});

describe('createPlatformBridge — native-load failure degrades to mock + banner (never silent)', () => {
  it('a throwing addon loader yields a mock bridge with a reason, not a crash', () => {
    const log = vi.fn();
    const sel = createPlatformBridge('win32', {
      getDisplays: () => ONE_DISPLAY,
      isInjectionHalted: () => false,
      log,
      buildWindowsBridge: () => { throw new Error('addon.node not found'); },
    });
    expect(sel.degradedToMock).toBe(true);
    expect(sel.reason).toContain('addon.node not found');
    expect(sel.bridge.getCursorPos()).toBeDefined(); // usable mock
    expect(log).toHaveBeenCalledWith('warn', 'native_addon_load_failed', expect.any(Object));
  });

  it('a successful build yields the real bridge, not degraded', () => {
    const addon = fakeAddon();
    const sel = createPlatformBridge('win32', {
      getDisplays: () => ONE_DISPLAY,
      isInjectionHalted: () => false,
      buildWindowsBridge: () =>
        createWindowsBridge({ loadAddon: () => addon, getDisplays: () => ONE_DISPLAY, isInjectionHalted: () => false }),
    });
    expect(sel.degradedToMock).toBe(false);
    sel.bridge.click('left');
    expect(addon.calls).toContainEqual(['click', [0]]);
  });
});
