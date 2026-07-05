// app/platform/index.ts
//
// Canonical PlatformBridge contract (plan FS-A). The overlay/panel never touch
// native input; only the main process, and only after user confirmation.

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

/** Key tokens the bridge accepts. Native maps these to VK/keycodes. */
export const ALLOWED_KEY_TOKENS: ReadonlySet<string> = new Set([
  'CTRL', 'ALT', 'SHIFT', 'META', 'WIN', 'CMD',
  'ENTER', 'ESC', 'TAB', 'SPACE', 'BACKSPACE', 'DELETE',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'END',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

export function assertKeyTokens(sequence: string[]): void {
  for (const token of sequence) {
    if (!ALLOWED_KEY_TOKENS.has(token)) {
      throw new Error(`Disallowed key token: ${JSON.stringify(token)}`);
    }
  }
}

/**
 * Select the platform bridge. Real native wrappers land in slices 1.8 (win) and
 * 2.1 (mac). Until a native addon loads, callers fall back to the mock bridge so
 * every UI/gateway slice is unblocked. `overrideForTest` supports DI in tests.
 */
export function createPlatformBridge(
  platform: NodeJS.Platform = process.platform,
): PlatformBridge {
  switch (platform) {
    case 'win32': {
      // Slice 1.8 swaps this for the real wrapper over windows-bridge.node.
      throw new UnsupportedPlatformError('win32:native-not-built');
    }
    case 'darwin': {
      // Slice 2.1 swaps this for the real wrapper over macos-bridge.node.
      throw new UnsupportedPlatformError('darwin:native-not-built');
    }
    default:
      throw new UnsupportedPlatformError(platform);
  }
}
