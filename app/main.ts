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

import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { IPC_CHANNELS } from './ipc/channels.js';
import { guidanceResponseSchema, safeParse } from './ipc/schemas.js';
import { createCursorMirror } from './overlay/cursor-mirror.js';
import { buildRenderModel, type DisplayBounds } from './overlay/render-model.js';
import { createGatewayServer } from '../gateway/server.js';
import { createPassStore } from '../gateway/policy/pass-store.js';
import { PROVIDERS } from '../gateway/providers/registry.js';
import { askAgent, getGateStatus, getQuiz, submitQuiz, type GatewayClientConfig } from './models/router.js';
import { createPlatformBridge, type CursorPos, type PlatformBridge } from './platform/index.js';
import { createMockBridge, type MockBridge } from './platform/mock.js';
import { killSwitch } from './ipc/kill-switch.js';
import { createProposalRegistry } from './ipc/proposal-registry.js';
import { registerAutomationHandlers, sendProposal } from './ipc/handlers.js';
import type { ProposedAction } from './models/types.js';

const here = dirname(fileURLToPath(import.meta.url));

const CURSOR_POLL_MS = 16; // ~60Hz sampling; cursor-mirror.ts throttles the actual emit rate
const CURSOR_STATES = ['idle', 'listening', 'thinking', 'executing', 'success', 'error'] as const;
const PANEL_SUMMON_SHORTCUT = 'CommandOrControl+Shift+Space';
// Deliberately NOT CommandOrControl (doc/plan §12): the kill switch must be one
// fixed chord on every OS, not remapped by the platform's usual modifier swap.
const KILL_SWITCH_SHORTCUT = 'Control+Alt+Backspace';

/** Model picked when the panel doesn't (yet) expose model selection — slice 1.5 is provider-only. */
const DEFAULT_MODEL_FOR_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
});

let overlayWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let gatewayConfig: GatewayClientConfig | null = null;
let tray: Tray | null = null;

// console.info/log are lint-disallowed project-wide (no-console); 'info'-level
// platform events still go to console.warn rather than being silently dropped.
function logPlatform(level: 'info' | 'warn', event: string, data?: Record<string, unknown>): void {
  console.warn(`[platform:${level}] ${event}`, data ?? {});
}

// Slice 1.8: on win32 this loads the real native bridge; on any load failure
// (including "not built yet") it degrades to the mock bridge + a reason,
// never a silent failure (§6). getDisplayBounds/killSwitch are passed in
// below, once they're both declared, so windows.ts never needs Electron.
//
// The e2e suite (slice 2.3+) is written against the deterministic MOCK bridge
// by default — assist.e2e.ts/panel.e2e.ts assert exact mock call logs, which
// only exist on MockBridge. On a machine where the native addon happens to be
// built, letting selection "win" would silently switch those tests onto the
// real bridge and break their assertions. CC_E2E_REAL_BRIDGE is the explicit
// opt-in the real-input e2e (assist-native.e2e.ts) uses instead.
const forceMockForE2E = process.env.CC_E2E === '1' && process.env.CC_E2E_REAL_BRIDGE !== '1';
const bridgeSelection = forceMockForE2E
  ? { bridge: createMockBridge(), degradedToMock: true, reason: 'e2e-forced-mock' }
  : createPlatformBridge(process.platform, {
      getDisplays: () => getDisplayBounds(),
      isInjectionHalted: () => killSwitch.isHalted(),
      log: logPlatform,
    });
const platformBridge: PlatformBridge = bridgeSelection.bridge;
if (bridgeSelection.degradedToMock) {
  logPlatform('warn', 'platform_bridge_degraded', { reason: bridgeSelection.reason });
}
const proposalRegistry = createProposalRegistry();

// --- e2e-only introspection + control hook (Playwright, specs/e2e-electron-scope.md) ---
//
// Guarded behind CC_E2E so it is INERT (never populates, never reachable) unless a test
// explicitly opts in. This exposes window CONFIG + narrow test controls only — never
// secrets, never the gateway token/URL. There is no bundler/dead-code-elimination step
// in this repo yet, so "absent in production" means "guarded and never executes/exposes
// anything," not physically stripped from the shipped file — acceptable since the guard
// is a single env-var check with no side effects when false.
const E2E = process.env.CC_E2E === '1';

interface E2EWindowInfo {
  transparent?: boolean;
  frame?: boolean;
  alwaysOnTop?: boolean;
  roundedCorners?: boolean;
  resizable?: boolean;
  focusable?: boolean;
  webPreferences?: { contextIsolation?: boolean; sandbox?: boolean; nodeIntegration?: boolean };
  ignoreMouseEvents?: { called: boolean; ignore?: boolean; forward?: boolean };
}

interface E2EHooks {
  windows: Partial<Record<'overlay' | 'panel', E2EWindowInfo>>;
  feedCursor(x: number, y: number): void;
  triggerNextState(): void;
  pushGuidance(raw: unknown): void;
  proposeAction(action: ProposedAction, origin: 'model' | 'task' | 'mcp'): string | null;
  /** Read-only view into the mock PlatformBridge's call log. Empty when the real
   * (non-mock) bridge is active — use getCursorPos() for the native-input e2e instead. */
  getBridgeCalls(): ReadonlyArray<{ fn: string; args: unknown[] }>;
  /** Works against either bridge — the real-input e2e (1.8) reads the actual OS cursor. */
  getCursorPos(): CursorPos;
  /** True when execute-action is running against the mock bridge, not real OS input. */
  isDegradedToMock(): boolean;
  /** The panel window's actual content-area size in pixels — a real mouse can never
   * reach anything rendered outside this box, unlike Playwright's CDP-based .click(),
   * which can dispatch to DOM coordinates regardless of the OS window's clipped bounds.
   * Tests assert element bounding boxes against this, not just that .click() succeeds. */
  getPanelContentBounds(): { width: number; height: number };
  /** Test-only kill-switch controls — same "directly callable" pattern as
   * feedCursor/triggerNextState above; the real triggers are the hotkey + tray. */
  haltKillSwitch(): void;
  resumeKillSwitch(): void;
}

declare global {
  var __ccE2E: E2EHooks | undefined;
}

if (E2E) {
  globalThis.__ccE2E = {
    windows: {},
    feedCursor: () => undefined,
    triggerNextState: () => undefined,
    pushGuidance: () => undefined,
    proposeAction: () => null,
    // Only the mock bridge exposes .calls; guarded by degradedToMock so this never
    // reaches into a real bridge that doesn't have it.
    getBridgeCalls: () =>
      bridgeSelection.degradedToMock
        ? (platformBridge as MockBridge).calls.map((c) => ({ fn: c.fn, args: c.args }))
        : [],
    getCursorPos: () => platformBridge.getCursorPos(),
    isDegradedToMock: () => bridgeSelection.degradedToMock,
    haltKillSwitch: () => killSwitch.halt('e2e-test'),
    resumeKillSwitch: () => killSwitch.resume(),
    getPanelContentBounds: () => {
      if (!panelWindow) return { width: 0, height: 0 };
      const size = panelWindow.getContentSize();
      return { width: size[0] ?? 0, height: size[1] ?? 0 };
    },
  };
}

function recordWindowIntrospection(name: 'overlay' | 'panel', info: E2EWindowInfo): void {
  if (!E2E) return;
  globalThis.__ccE2E!.windows[name] = info;
}

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
  const options = {
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
  };
  const win = new BrowserWindow(options);

  win.setIgnoreMouseEvents(true, { forward: true });
  win.setMenu(null);
  recordWindowIntrospection('overlay', {
    transparent: options.transparent,
    frame: options.frame,
    alwaysOnTop: options.alwaysOnTop,
    roundedCorners: options.roundedCorners,
    resizable: options.resizable,
    focusable: options.focusable,
    webPreferences: {
      contextIsolation: options.webPreferences.contextIsolation,
      sandbox: options.webPreferences.sandbox,
      nodeIntegration: options.webPreferences.nodeIntegration,
    },
    ignoreMouseEvents: { called: true, ignore: true, forward: true },
  });

  // Overlay never navigates and never opens a new window (no remote content, ever).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void win.loadFile(join(here, 'overlay', 'overlay.html'));
  return win;
}

/** Focusable strip/panel window — a SEPARATE window from the overlay, NOT click-through. */
function createPanelWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay();
  const options = {
    x: primary.bounds.x + 24,
    y: Math.round(primary.bounds.y + primary.bounds.height / 2 - 72),
    width: 380,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: join(here, 'preload.js'),
    },
  };
  const win = new BrowserWindow(options);

  win.setMenu(null);
  recordWindowIntrospection('panel', {
    transparent: options.transparent,
    frame: options.frame,
    alwaysOnTop: options.alwaysOnTop,
    roundedCorners: options.roundedCorners,
    resizable: options.resizable,
    focusable: options.focusable,
    webPreferences: {
      contextIsolation: options.webPreferences.contextIsolation,
      sandbox: options.webPreferences.sandbox,
      nodeIntegration: options.webPreferences.nodeIntegration,
    },
    ignoreMouseEvents: { called: false },
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void win.loadFile(join(here, 'panel', 'panel.html'));
  return win;
}

/** Tray icon with an always-reachable Stop/Resume — the kill switch shouldn't
 * depend on remembering a hotkey (§12). */
function createKillSwitchTray(): Tray {
  const icon = nativeImage.createFromPath(join(here, 'assets', 'tray-icon.png'));
  const t = new Tray(icon);
  t.setToolTip('Click Click');
  const rebuildMenu = (): void => {
    t.setContextMenu(
      Menu.buildFromTemplate([
        killSwitch.isHalted()
          ? { label: 'Resume automation', click: () => killSwitch.resume() }
          : { label: 'Stop automation', click: () => killSwitch.halt('tray') },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  };
  rebuildMenu();
  killSwitch.subscribe(rebuildMenu);
  return t;
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

/**
 * e2e mode replaces the real-cursor poll + wall-clock timers with directly
 * callable, deterministic controls (still routed through the same
 * cursor-mirror change-detection and the same dispatchGuidance validation
 * path — only the trigger source differs).
 */
function setupE2EControls(overlay: BrowserWindow): void {
  const mirror = createCursorMirror();
  let stateIndex = 0;

  globalThis.__ccE2E!.feedCursor = (x: number, y: number): void => {
    const emit = mirror.feed({ x, y }, Date.now());
    if (emit) overlay.webContents.send(IPC_CHANNELS.CURSOR_POS_UPDATE, emit);
  };
  globalThis.__ccE2E!.triggerNextState = (): void => {
    overlay.webContents.send(IPC_CHANNELS.CURSOR_STATE_UPDATE, CURSOR_STATES[stateIndex % CURSOR_STATES.length]);
    stateIndex += 1;
  };
  globalThis.__ccE2E!.pushGuidance = (raw: unknown): void => {
    dispatchGuidance(overlay, raw);
  };
}

/** Mints + sends a proposal to the panel. Returns the proposalId, or null if rate-limited. */
function proposeToPanel(action: ProposedAction, origin: 'model' | 'task' | 'mcp'): string | null {
  if (!panelWindow) return null;
  const result = sendProposal(proposalRegistry, panelWindow.webContents, action, origin);
  return result?.proposalId ?? null;
}

/** Dev-only hook: proposes one sample action so the confirm-flow demo has something to show. */
function startDevProposalDemo(): void {
  const sample: ProposedAction = {
    actionType: 'focus',
    targetWindowTitle: 'Settings',
    description: 'A scripted task wants to bring Settings to the foreground.',
  };
  setTimeout(() => proposeToPanel(sample, 'task'), 6000);
}

/** Starts the loopback gateway and records the token + URL for the IPC handlers below. */
async function startGateway(): Promise<GatewayClientConfig> {
  // CC_DATA_DIR overrides the pass-store location — used by the e2e harness so
  // each test launch gets a hermetic, disposable data dir instead of writing
  // into a real user's persistent app-data location (which would otherwise
  // make gate-pass state leak across separate app launches/test runs).
  const passStore = process.env.CC_DATA_DIR ? createPassStore(process.env.CC_DATA_DIR) : undefined;
  const gw = createGatewayServer(passStore ? { passStore } : {});
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
  panelWindow = createPanelWindow();
  globalShortcut.register(PANEL_SUMMON_SHORTCUT, () => {
    if (!panelWindow) return;
    if (panelWindow.isVisible()) panelWindow.focus();
    else panelWindow.show();
  });

  // §12: one fixed chord halts all automation instantly, from anywhere.
  globalShortcut.register(KILL_SWITCH_SHORTCUT, () => killSwitch.halt('hotkey'));
  tray = createKillSwitchTray();
  killSwitch.subscribe((halted) => {
    // Belt-and-suspenders visual: the overlay (the thing that visualizes automation)
    // disappears the instant input is halted, so a halted state is never ambiguous.
    overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
    if (halted) overlayWindow?.hide();
    else overlayWindow?.show();
  });

  registerAutomationHandlers({
    ipcMain,
    registry: proposalRegistry,
    bridge: platformBridge,
    panelWebContents: () => panelWindow?.webContents ?? null,
    executeOptions: { displays: getDisplayBounds() },
  });
  // TTL-expired proposals never execute (consume() already checks), but this
  // periodically frees the Map entries themselves rather than leaking memory
  // for proposals nobody ever decided on.
  setInterval(() => proposalRegistry.expireStale(), 10_000);

  if (E2E) {
    // Deterministic, directly-callable controls replace the real cursor poll
    // and wall-clock demo timers — see setupE2EControls().
    setupE2EControls(overlayWindow);
    globalThis.__ccE2E!.proposeAction = proposeToPanel;
  } else {
    startCursorMirror(overlayWindow);
    if (process.env.NODE_ENV !== 'production') {
      startDevStateCycler(overlayWindow);
      startDevGuidanceDemo(overlayWindow);
      startDevProposalDemo();
    }
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
  tray?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
