// app/platform/mock.ts
//
// Mock PlatformBridge (plan slice 1.3). Deterministic and inert: it records what
// it was asked to do so tests and the guide-only fallback can assert behavior
// without moving a real cursor or touching the OS. Enforces the key whitelist so
// the same validation path is exercised as the real bridge.

import {
  assertKeyTokens,
  type CaptureScope,
  type ClickType,
  type CursorPos,
  type PlatformBridge,
} from './index.js';

export interface MockCall {
  fn: keyof PlatformBridge;
  args: unknown[];
  at: number;
}

export interface MockBridge extends PlatformBridge {
  readonly calls: readonly MockCall[];
  setCursor(pos: CursorPos): void;
  reset(): void;
}

export function createMockBridge(initial: CursorPos = { x: 0, y: 0 }): MockBridge {
  let cursor: CursorPos = { ...initial };
  const calls: MockCall[] = [];
  const record = (fn: keyof PlatformBridge, args: unknown[]): void => {
    calls.push({ fn, args, at: Date.now() });
  };

  return {
    calls,
    setCursor(pos: CursorPos): void {
      cursor = { ...pos };
    },
    reset(): void {
      cursor = { ...initial };
      calls.length = 0;
    },
    getCursorPos(): CursorPos {
      record('getCursorPos', []);
      return { ...cursor };
    },
    moveCursor(pos: CursorPos): void {
      record('moveCursor', [pos]);
      cursor = { ...pos };
    },
    click(type: ClickType): void {
      record('click', [type]);
    },
    sendKeys(sequence: string[]): void {
      assertKeyTokens(sequence); // same guard as real bridges
      record('sendKeys', [sequence]);
    },
    async captureScreen(scope: CaptureScope): Promise<Buffer> {
      record('captureScreen', [scope]);
      // Return a tiny deterministic buffer standing in for an encoded image.
      return Buffer.from(`mock-capture:${scope}`, 'utf8');
    },
    focusWindow(title: string): void {
      record('focusWindow', [title]);
    },
  };
}
