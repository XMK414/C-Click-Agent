// tests/ipc/kill-switch.test.ts

import { describe, it, expect, vi } from 'vitest';
import { createKillSwitch } from '../../app/ipc/kill-switch.js';

describe('kill switch', () => {
  it('starts disengaged and engages on halt', () => {
    const ks = createKillSwitch();
    expect(ks.isHalted()).toBe(false);
    ks.halt('user pressed the hotkey');
    expect(ks.isHalted()).toBe(true);
    expect(ks.lastReason()).toBe('user pressed the hotkey');
  });

  it('resume clears the halt and the reason', () => {
    const ks = createKillSwitch(true);
    expect(ks.isHalted()).toBe(true);
    ks.resume();
    expect(ks.isHalted()).toBe(false);
    expect(ks.lastReason()).toBeNull();
  });

  it('notifies subscribers only on transitions (idempotent halt/resume)', () => {
    const ks = createKillSwitch();
    const fn = vi.fn();
    ks.subscribe(fn);
    ks.halt(); ks.halt(); // second halt is a no-op
    ks.resume(); ks.resume(); // second resume is a no-op
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, true);
    expect(fn).toHaveBeenNthCalledWith(2, false);
  });

  it('unsubscribe stops notifications', () => {
    const ks = createKillSwitch();
    const fn = vi.fn();
    const off = ks.subscribe(fn);
    off();
    ks.halt();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('kill switch ↔ platform bridge (integration contract)', () => {
  it('wired as isInjectionHalted, it halts the wrapper (proves the two layers connect)', async () => {
    const { createWindowsBridge } = await import('../../app/platform/windows.js');
    const ks = createKillSwitch();
    const calls: string[] = [];
    const bridge = createWindowsBridge({
      loadAddon: () => ({
        getCursorPos: () => ({ x: 0, y: 0 }),
        moveCursor: () => calls.push('move'),
        click: () => calls.push('click'),
        sendKeys: () => calls.push('keys'),
        captureScreen: () => '',
        focusWindow: () => calls.push('focus'),
      }),
      getDisplays: () => [{ x: 0, y: 0, width: 1920, height: 1080 }],
      isInjectionHalted: () => ks.isHalted(), // the wiring under test
    });

    bridge.click('left');
    expect(calls).toEqual(['click']);

    ks.halt('engaged mid-session');
    expect(() => bridge.click('left')).toThrow(/halted/i);
    expect(calls).toEqual(['click']); // nothing new reached the addon
  });
});
