// app/platform/windows.ts
//
// Thin, security-hardened wrapper over the native Windows addon (slice 1.8).
//
// Intentionally Electron-free and dependency-injected so it is fully unit-testable in
// the core lane WITHOUT a Windows machine or a display. The native addon
// (windows-bridge.node) is loaded through an injectable loader; display bounds and the
// kill-switch state are injected. The native C++ is verified separately on
// windows-latest; THIS layer — where the security decisions live — is verified here.
//
// Defense-in-depth performed here, BEFORE anything reaches the OS:
//   1. sendKeys re-validates every token against ALLOWED_KEY_TOKENS (native validates too).
//   2. moveCursor/click coordinates are clamped to a real display; out-of-bounds is
//      rejected + flagged, never injected (no off-screen / hidden-target injection).
//   3. Every injecting method checks the kill-switch predicate first; if halted, it is a
//      logged throw (belt-and-suspenders with execute-action's own check).
//   4. If the addon fails to load, the caller falls back to the mock bridge + banner.

import { createRequire } from 'node:module';
import {
  type CaptureScope,
  type ClickType,
  type CursorPos,
  type PlatformBridge,
} from './index.js';
import { assertKeyTokens } from './key-tokens.js';
import { vkFor as defaultVkFor, MODIFIER_TOKENS } from './keymap.js';

/** Shape the native addon must expose (and ONLY this — asserted by the native tests). */
export interface WindowsNativeAddon {
  getCursorPos(): { x: number; y: number };
  moveCursor(x: number, y: number): void;
  click(button: 0 | 1 | 2): void; // 0=left 1=right 2=middle
  sendKeys(vkCodes: number[], modifiers: number[]): void;
  captureScreen(fullScreen: boolean): string; // base64 PNG
  focusWindow(title: string): void;
}

export interface DisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowsBridgeDeps {
  /** Loads the native addon. Injectable so tests supply a fake; prod uses requireAddon(). */
  loadAddon: () => WindowsNativeAddon;
  /** All display bounds, in the same coordinate space the addon expects. */
  getDisplays: () => DisplayBounds[];
  /** True when the kill switch has halted injection. Checked before every OS action. */
  isInjectionHalted: () => boolean;
  /** Structured logger. Never receives secrets or key material. */
  log?: (level: 'info' | 'warn', event: string, data?: Record<string, unknown>) => void;
  /** VK lookup (defaults to keymap.vkFor); injectable for tests. */
  vkFor?: (token: string) => number;
  /** Modifier classification (defaults to keymap.MODIFIER_TOKENS). */
  isModifier?: (token: string) => boolean;
}

export class InjectionHaltedError extends Error {
  constructor() {
    super('Injection halted by kill switch.');
    this.name = 'InjectionHaltedError';
  }
}

export class CoordinateOutOfBoundsError extends Error {
  constructor(public readonly pos: CursorPos) {
    super(`Coordinate ${pos.x},${pos.y} is outside all displays.`);
    this.name = 'CoordinateOutOfBoundsError';
  }
}

const CLICK_CODE: Record<ClickType, 0 | 1 | 2> = { left: 0, right: 1, middle: 2 };

/** Point-in-rect test (rects are half-open on the far edge). */
function withinAny(pos: CursorPos, displays: DisplayBounds[]): boolean {
  return displays.some(
    (d) => pos.x >= d.x && pos.x < d.x + d.width && pos.y >= d.y && pos.y < d.y + d.height,
  );
}

/**
 * Build the Windows PlatformBridge. Throws if the addon can't load — the caller
 * (createPlatformBridge) catches that and falls back to the mock bridge + banner.
 */
export function createWindowsBridge(deps: WindowsBridgeDeps): PlatformBridge {
  const log = deps.log ?? ((): void => {});
  const vkFor = deps.vkFor ?? defaultVkFor;
  const isModifier = deps.isModifier ?? ((t: string): boolean => MODIFIER_TOKENS.has(t));

  const addon = deps.loadAddon(); // throws on failure → caller falls back to mock

  const guardHalted = (action: string): void => {
    if (deps.isInjectionHalted()) {
      log('warn', 'injection_halted', { action });
      throw new InjectionHaltedError();
    }
  };

  const guardBounds = (pos: CursorPos): void => {
    if (!withinAny(pos, deps.getDisplays())) {
      log('warn', 'coordinate_out_of_bounds', { x: pos.x, y: pos.y });
      throw new CoordinateOutOfBoundsError(pos);
    }
  };

  return {
    getCursorPos(): CursorPos {
      const p = addon.getCursorPos();
      return { x: p.x, y: p.y };
    },

    moveCursor(pos: CursorPos): void {
      guardHalted('moveCursor');
      guardBounds(pos);
      addon.moveCursor(pos.x, pos.y);
    },

    click(type: ClickType): void {
      guardHalted('click');
      addon.click(CLICK_CODE[type]);
    },

    sendKeys(sequence: string[]): void {
      guardHalted('sendKeys');
      assertKeyTokens(sequence); // defense in depth — native validates too
      const modifiers: number[] = [];
      const keys: number[] = [];
      for (const token of sequence) {
        const vk = vkFor(token);
        if (isModifier(token)) modifiers.push(vk);
        else keys.push(vk);
      }
      addon.sendKeys(keys, modifiers);
    },

    async captureScreen(scope: CaptureScope): Promise<Buffer> {
      // Capture is read-only (not injection) but still requires consent upstream (§7).
      const base64 = addon.captureScreen(scope === 'full-screen');
      return Buffer.from(base64, 'base64');
    },

    focusWindow(title: string): void {
      guardHalted('focusWindow');
      addon.focusWindow(title);
    },
  };
}

/** Production addon loader. Kept separate so the path is the only prod-specific bit. */
export function requireAddon(): WindowsNativeAddon {
  // A bare `require(...)` in an ESM file resolves relative to whatever module
  // happens to be calling it, not this file's own directory — createRequire
  // (Node's documented fix for require-ing a native addon from inside an ES
  // module) anchors resolution to THIS file regardless of caller.
  const require = createRequire(import.meta.url);
  const mod = require('./native/build/Release/windows-bridge.node') as WindowsNativeAddon;
  return mod;
}
