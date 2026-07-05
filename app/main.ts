// app/main.ts — Electron main: overlay window, cursor mirror, guidance dispatch.
//
// SLICE 1.4. Security flags are mandatory (§7): contextIsolation: true,
// sandbox: true, nodeIntegration: false, preload only. Overlay = transparent,
// always-on-top, click-through, screen-bounds frameless (NOT fullscreen: true —
// that triggers the macOS Spaces bug; see FS-G item 8).

import { app, BrowserWindow, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { IPC_CHANNELS } from './ipc/channels.js';
import { guidanceResponseSchema, safeParse } from './ipc/schemas.js';
import { createCursorMirror } from './overlay/cursor-mirror.js';
import { buildRenderModel, type DisplayBounds } from './overlay/render-model.js';

const here = dirname(fileURLToPath(import.meta.url));

const CURSOR_POLL_MS = 16; // ~60Hz sampling; cursor-mirror.ts throttles the actual emit rate
const CURSOR_STATES = ['idle', 'listening', 'thinking', 'executing', 'success', 'error'] as const;

function getDisplayBounds(): DisplayBounds[] {
  return screen.getAllDisplays().map((d, i) => ({
    id: i,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
  }));
}

function createOverlayWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: primary.bounds.x,
    y: primary.bounds.y,
    width: primary.bounds.width,
    height: primary.bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    fullscreen: false, // NEVER true — trips the macOS Spaces bug (FS-G item 8)
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    // Electron 42+ defaults frameless windows to rounded corners, which would
    // clip this transparent, screen-bounds surface at the edges.
    roundedCorners: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(here, 'preload.js'),
    },
  });

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setMenu(null);

  // Overlay never navigates and never opens a new window (no remote content, ever).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void win.loadFile(join(here, 'overlay', 'overlay.html'));
  return win;
}

function startCursorMirror(win: BrowserWindow): () => void {
  const mirror = createCursorMirror();
  const timer = setInterval(() => {
    const point = screen.getCursorScreenPoint();
    const emit = mirror.feed({ x: point.x, y: point.y }, Date.now());
    if (emit) win.webContents.send(IPC_CHANNELS.CURSOR_POS_UPDATE, emit);
  }, CURSOR_POLL_MS);
  return () => clearInterval(timer);
}

/**
 * Validate an inbound GuidanceResponse and, only if valid, clamp its points
 * against the CURRENT real display layout before dispatching to the overlay.
 * Defense in depth: the renderer also treats this payload as untrusted.
 */
export function dispatchGuidance(win: BrowserWindow, raw: unknown): void {
  const parsed = safeParse(guidanceResponseSchema, raw);
  if (!parsed.ok) {
    console.error('[main] dropped invalid GuidanceResponse: ' + parsed.error);
    return;
  }
  const model = buildRenderModel(parsed.value, getDisplayBounds());
  win.webContents.send(IPC_CHANNELS.GUIDANCE_UPDATE, model);
}

/** Dev-only hook: cycles the 6 cursor states on a timer so the demo can show them all. */
function startDevStateCycler(win: BrowserWindow): () => void {
  let i = 0;
  const timer = setInterval(() => {
    win.webContents.send(IPC_CHANNELS.CURSOR_STATE_UPDATE, CURSOR_STATES[i % CURSOR_STATES.length]);
    i += 1;
  }, 2000);
  return () => clearInterval(timer);
}

/** Dev-only hook: pushes one sample GuidanceResponse through the real validation
 * + clamping path so the step-rendering demo has something to show. */
function startDevGuidanceDemo(win: BrowserWindow): void {
  const sample: unknown = {
    mode: 'guide',
    steps: [
      { text: 'Open Settings', point: { x: 200, y: 150 } },
      { text: 'Click "Sound"' },
    ],
  };
  setTimeout(() => dispatchGuidance(win, sample), 3000);
}

void app.whenReady().then(() => {
  const overlay = createOverlayWindow();
  startCursorMirror(overlay);

  if (process.env.NODE_ENV !== 'production') {
    startDevStateCycler(overlay);
    startDevGuidanceDemo(overlay);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
