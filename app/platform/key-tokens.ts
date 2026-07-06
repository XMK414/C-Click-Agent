// app/platform/key-tokens.ts
//
// The key-token whitelist + validator (plan FS-A/§7). Split out of
// app/platform/index.ts (slice 1.8): index.ts also selects/loads the native
// Windows bridge, which pulls in Node-only code (a native .node require,
// node:module's createRequire) that a browser bundler cannot resolve.
// app/ipc/schemas.ts is imported by panel.ts (a renderer entry point), so
// anything it imports must stay renderer-safe — this file has zero Node/
// native dependencies for exactly that reason. Everything else (index.ts,
// mock.ts, windows.ts, execute-action.ts) imports from here too, so there is
// still only one whitelist.

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
