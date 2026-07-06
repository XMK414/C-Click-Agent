// app/platform/index.ts
//
// Canonical PlatformBridge contract (plan FS-A). The overlay/panel never touch
// native input; only the main process, and only after user confirmation.

import { createRequire } from 'node:module';
import { createMockBridge } from './mock.js';

export interface CursorPos {
  x: number;
  y: number;
  display?: number;
}

export type ClickType = 'left' | 'right' | 'middle';
export type CaptureScope = 'active-window' | 'full-screen';

export interface PlatformBridge {
  getCursorPos(): CursorPos;
  moveCursor(pos: CursorPos): void;
  click(type: ClickType): void;
  /** Whitelisted key tokens only, e.g. ['CTRL','SHIFT','ESC']. No raw scancodes. */
  sendKeys(sequence: string[]): void;
  /** Caller MUST hold capture consent before invoking. */
  captureScreen(scope: CaptureScope): Promise<Buffer>;
  focusWindow(title: string): void;
}

export class UnsupportedPlatformError extends Error {
  constructor(public readonly platform: string) {
    super(`Unsupported platform: ${platform}. Running in guide-text-only mode.`);
    this.name = 'UnsupportedPlatformError';
  }
}

/** Result of selecting a bridge: the bridge itself + whether we fell back to mock. */
export interface BridgeSelection {
  bridge: PlatformBridge;
  /** True when the native addon failed to load and we degraded to the mock bridge. */
  degradedToMock: boolean;
  /** Human-facing reason for the banner when degraded. */
  reason?: string;
}

/**
 * Dependencies the selector needs to build a real native bridge. Injected by main
 * (which owns Electron's `screen` API and the kill-switch state). Kept as a parameter
 * so this module stays Electron-free and unit-testable.
 */
export interface PlatformSelectDeps {
  getDisplays: () => Array<{ x: number; y: number; width: number; height: number }>;
  isInjectionHalted: () => boolean;
  log?: (level: 'info' | 'warn', event: string, data?: Record<string, unknown>) => void;
  /** Test seam: build the win32 bridge (defaults to the real wrapper). */
  buildWindowsBridge?: (deps: PlatformSelectDeps) => PlatformBridge;
}

/**
 * Select the platform bridge. On Windows, load the native addon; if it fails, degrade
 * to the mock bridge with a visible-banner reason — NEVER a silent failure (§6). macOS
 * lands in slice 2.1. Callers without native deps get the guide-only mock everywhere.
 */
export function createPlatformBridge(
  platform: NodeJS.Platform = process.platform,
  deps?: PlatformSelectDeps,
): BridgeSelection {
  switch (platform) {
    case 'win32': {
      if (!deps) {
        // No native deps supplied (e.g. a headless/test context) → guide-only mock.
        return { bridge: createMockBridge(), degradedToMock: true, reason: 'no-native-deps' };
      }
      try {
        const bridge = deps.buildWindowsBridge
          ? deps.buildWindowsBridge(deps)
          : buildRealWindowsBridge(deps);
        return { bridge, degradedToMock: false };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        deps.log?.('warn', 'native_addon_load_failed', { platform, reason });
        return { bridge: createMockBridge(), degradedToMock: true, reason };
      }
    }
    case 'darwin': {
      // Slice 2.1 swaps this for the real macOS wrapper; mock keeps the app usable.
      return { bridge: createMockBridge(), degradedToMock: true, reason: 'darwin:native-not-built' };
    }
    default:
      return { bridge: createMockBridge(), degradedToMock: true, reason: `${platform}:unsupported` };
  }
}

/** Lazily wire the real Windows wrapper so this module never imports native at load time. */
function buildRealWindowsBridge(deps: PlatformSelectDeps): PlatformBridge {
  // createRequire(import.meta.url), not a bare `require`: a bare require inside an
  // ESM file resolves relative to whatever module happens to be calling it, not
  // this file's own directory (see windows.ts's requireAddon for the same fix).
  const require = createRequire(import.meta.url);
  const { createWindowsBridge, requireAddon } = require('./windows.js');
  return createWindowsBridge({
    loadAddon: requireAddon,
    getDisplays: deps.getDisplays,
    isInjectionHalted: deps.isInjectionHalted,
    log: deps.log,
  });
}
