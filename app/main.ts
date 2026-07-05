// app/main.ts — Electron main: windows, gateway lifecycle, IPC mediation.
//
// SLICE 1.4/1.5. Security flags are mandatory (§7): contextIsolation: true,
// sandbox: true, nodeIntegration: false, preload only. Overlay = transparent,
// always-on-top, click-through, screen-bounds frameless (NOT fullscreen: true —
// that triggers the macOS Spaces bug; see FS-G item 8). Panel = focusable strip,
// NOT click-through, a separate window from the overlay.
//
// The gateway's per-launch bearer token and loopback URL live ONLY in this
// process. Every panel -> gateway call is mediated by an ipcMain.handle below;
// the renderer never sees the token or the URL, only JSON results.

import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { IPC_CHANNELS } from './ipc/channels.js';
import { guidanceResponseSchema, safeParse } from './ipc/schemas.js';
import { createCursorMirror } from './overlay/cursor-mirror.js';
import { buildRenderModel, type DisplayBounds } from './overlay/render-model.js';
import { createGatewayServer } from '../gateway/server.js';
import { PROVIDERS } from '../gateway/providers/registry.js';
import { askAgent, getGateStatus, getQuiz, submitQuiz, type GatewayClientConfig } from './models/router.js';

const here = dirname(fileURLToPath(import.meta.url));

const CURSOR_POLL_MS = 16; // ~60Hz sampling; cursor-mirror.ts throttles the actual emit rate
const CURSOR_STATES = ['idle', 'listening', 'thinking', 'executing', 'success', 'error'] as const;
const PANEL_SUMMON_SHORTCUT = 'CommandOrControl+Shift+Space';

/** Model picked when the panel doesn't (yet) expose model selection — slice 1.5 is provider-only. */
const DEFAULT_MODEL_FOR_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
});

let overlayWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let gatewayConfig: GatewayClientConfig | null = null;

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

/** Focusable strip/panel window — a SEPARATE window from the overlay, NOT click-through. */
function createPanelWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    x: primary.bounds.x + 24,
    y: Math.round(primary.bounds.y + primary.bounds.height / 2 - 72),
    width: 380,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(here, 'preload.js'),
    },
  });

  win.setMenu(null);
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void win.loadFile(join(here, 'panel', 'panel.html'));
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

/** Starts the loopback gateway and records the token + URL for the IPC handlers below. */
async function startGateway(): Promise<GatewayClientConfig> {
  const gw = createGatewayServer();
  const server = await gw.listen(0); // ephemeral port, 127.0.0.1 only
  const address = server.address() as AddressInfo;
  return { baseUrl: 'http://127.0.0.1:' + String(address.port), token: gw.token };
}

function requireGatewayConfig(): GatewayClientConfig {
  if (!gatewayConfig) throw new Error('gateway is not started yet');
  return gatewayConfig;
}

/** Registers every panel -> gateway IPC handler. The token/URL never leave main. */
function registerPanelHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.GET_PROVIDERS,
    (): Array<{ id: string; name: string }> =>
      Object.values(PROVIDERS).map((p) => ({ id: p.id, name: p.name })),
  );

  ipcMain.handle(IPC_CHANNELS.GET_GATE_STATUS, async (_event, provider: string) =>
    getGateStatus(requireGatewayConfig(), provider),
  );

  ipcMain.handle(IPC_CHANNELS.GET_QUIZ, async (_event, provider: string) =>
    getQuiz(requireGatewayConfig(), provider),
  );

  ipcMain.handle(IPC_CHANNELS.SUBMIT_QUIZ, async (_event, provider: string, answers: Record<string, number>) =>
    submitQuiz(requireGatewayConfig(), provider, answers),
  );

  ipcMain.handle(
    IPC_CHANNELS.ASK_AGENT,
    async (_event, args: { prompt: string; provider: string; providerKey: string }) => {
      panelWindow?.webContents.send(IPC_CHANNELS.PANEL_STATE, 'Processing');
      try {
        const model = DEFAULT_MODEL_FOR_PROVIDER[args.provider] ?? args.provider;
        const result = await askAgent(
          requireGatewayConfig(),
          { provider: args.provider, model, messages: [{ role: 'user', content: args.prompt }] },
          args.providerKey,
        );
        if (overlayWindow) dispatchGuidance(overlayWindow, result);
        return result;
      } finally {
        panelWindow?.webContents.send(IPC_CHANNELS.PANEL_STATE, 'Replying');
      }
    },
  );
}

void app.whenReady().then(async () => {
  gatewayConfig = await startGateway();
  registerPanelHandlers();

  overlayWindow = createOverlayWindow();
  startCursorMirror(overlayWindow);

  panelWindow = createPanelWindow();
  globalShortcut.register(PANEL_SUMMON_SHORTCUT, () => {
    if (!panelWindow) return;
    if (panelWindow.isVisible()) panelWindow.focus();
    else panelWindow.show();
  });

  if (process.env.NODE_ENV !== 'production') {
    startDevStateCycler(overlayWindow);
    startDevGuidanceDemo(overlayWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      overlayWindow = createOverlayWindow();
      panelWindow = createPanelWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
