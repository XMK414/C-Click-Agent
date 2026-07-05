# CLICK CLICK — Everyone's 1st Agent
## Code Plan · `cross-platform-screen-agent` · v1.0
*Built on CODE_PLAN_TEMPLATE v1.1. This document supersedes the raw multi-chat export (`Click_Click__Everyones_1st_agent_(1).md`). Where the export conflicted with itself, this document wins. Every correction and decision made during consolidation is logged in Appendix FS-G.*

---

## QUICK FILL
- **Feature:** `cross-platform-screen-agent` ("Click Click") — desktop overlay buddy that guides (points + narrates), assists (confirm-gated automation), and reasons via BYO-key LLM providers with screen context
- **Goal:** Ship Phase 1 (Windows MVP: overlay + guided tasks + gateway with Critical ToS Gate), then Phases 2–4 (macOS parity, MCP tools, voice/animation/browser)
- **Files touched:** Greenfield repo — full tree in §4
- **Tests required:** Unit (bridges, router, registry, gate), integration (gateway, IPC, end-to-end guidance), dedicated security suite (§9)
- **Risks:** Native addon build complexity (long pole) · MCP action tools bypassing confirmation (closed in §6) · unauthenticated localhost services (closed in §7) · OpenAI reachable through OpenRouter without its own gate (closed in §6 aggregator rule)
- **Touches Critical-ToS provider?** **YES** → gate is MANDATORY (template Appendix C; operationalized in FS-C)
- **Interaction Pattern:** 3
- **Time Budget:** Phase 1: 2–3 days · Phases 1–4 total: ~2 weeks of Code sessions

---

## 0 · PLAN METADATA
- **Plan title:** Click Click — Cross-Platform Screen Agent
- **Plan ID / branch:** `click-click` / `feat/click-click-phase-1`
- **Author / Owner:** Kyle (Motion Activated) · consolidated by Claude
- **Date / Last updated:** 2026-07-03
- **Status:** Draft → **Curated** → Approved → Executing → Done *(flip to Approved to start Phase 1)*
- **Target models:** Fable 5 (this one-time architecture/consolidation pass — done), Opus 4.8 (per-phase plan refinement), Sonnet 4.6 (implementation + validation), Haiku 4.5 (scouting)
- **Interaction Pattern level:** 3 — justified in §2
- **Linked artifacts:** CODE_PLAN_TEMPLATE.md v1.1 + v1.1 patch notes · raw export (archival only — never load into a build context)

---

## 1 · CONTEXT & PROBLEM STATEMENT
- **Objective:** A cross-platform (Windows + macOS) "screen buddy": a transparent, always-on-top, click-through overlay with a buddy cursor that mirrors the user's pointer, points at UI elements, and narrates steps. Optionally performs controlled actions (click, type, focus) — every action requires explicit per-action user confirmation. Reasoning runs through BYO-key providers (OpenRouter primary, OAuth providers) with consent-gated screen context. MCP tools add read-only local capability.
- **Definition of done:** Per-phase DoD in §14.
- **Non-goals:**
  - **NG1** — Not a full RPA platform: no multi-app automation pipelines, no headless scripting engine
  - **NG2** — Not an accessibility-suite replacement: guidance/assist layer only
  - **NG3** — No internal OpenAI dependency: BYO-key external providers only, behind the gate
  - **NG4** — No silent or background destructive actions: no file deletion, registry edits, or system config changes, ever
  - **NG5** — Not a browser-extension platform: basic navigation + DOM interaction only
  - **NG6** — No cloud backend in v1: everything runs on the user's machine; keys never transit Motion Activated infrastructure
  - **NG7** — No telemetry by default: opt-in only, anonymized, never screen content
- **Why now / business value:** Flagship consumer wedge — "everyone's first agent." Showcases the Motion Activated BYO-key + Critical ToS Gate posture as a product feature, not a limitation.
- **Inherited constraints:** Standing standards + §6 + template Appendix C gate spec.
- **Time Budget:** Per QUICK FILL. *(Honesty note: the raw export's "ship by early AM" framing was not a real schedule for this scope and has been dropped. The phase budgets below are the honest ones.)*

---

## 2 · INTERACTION PATTERN DECISION
- **Chosen level:** 3 — plan approved up front; Builder is autonomous within a slice; humans review only at the three checkpoints in §11.
- **Rule-of-Three check:** yes — bridge/gateway/UI slices repeat the same build→test→review loop three-plus times; the loop is standardized here rather than re-negotiated per slice.
- **Why not lower (1–2):** Pinned contracts (FS-A) + greenfield repo make per-step confirmation pure overhead.
- **Why not higher (4–5):** Input-injection and key-handling code is security-critical. Scaffold review, gate-question review, and pre-merge review stay human.
- **Known gap:** Template Appendix A (Interaction Pattern Matrix) is still not inlined (v1.1 open item). Level semantics assumed per standing usage; inline the appendix to remove this assumption.

---

## 3 · CONTEXT PRIMING PLAN
- **Prime command:** `/prime`
- **Read on entry:** README.md, CLAUDE.md, repo tree, `specs/click-click.plan.md` (this file)
- **Feature docs to ingest:** FS-A through FS-F below — all contracts live there
- **Reduce:** Only the active slice's paths + FS-A contracts. **Never load the raw export** — it contains three conflicting IPC definitions and superseded security posture.
- **Delegate (Scout / Haiku 4.5):**
  - Electron security checklist deltas since training
  - node-addon-api + N-API version pinning for Node 20 / current Electron
  - Windows Graphics Capture minimum OS build; GDI fallback triggers
  - macOS TCC permission flows (Accessibility + Screen Recording) and ScreenCaptureKit vs `CGWindowListCreateImage` deprecation status
  - MCP spec conformance check for the local JSON-RPC servers
- **Repo Reality Check:** `git ls-files` confirms all §4 paths exist before each slice. This plan's tree is the source of truth for scaffolding.

---

## 4 · ARCHITECTURE & DIRECTORY MAP
```text
click-click/
  app/
    main.ts                    # Electron main: windows, lifecycle, global shortcuts, kill switch
    preload.ts                 # contextBridge: typed, minimal IPC surface (renderers get NO Node access)
    overlay/
      overlay.html             # Transparent overlay UI
      overlay.ts               # Buddy cursor, highlights, step rendering (visualize-only)
      styles.css
    panel/
      panel.html               # Control strip/panel: input, providers, MCP toggles, confirmations
      panel.ts                 # State machine, summon triggers, confirmation UI
      styles.css
    platform/
      index.ts                 # PlatformBridge selector + typed errors
      windows.ts               # Thin wrapper over Windows native addon
      macos.ts                 # Thin wrapper over macOS native addon
      mock.ts                  # Mock bridge — unblocks all UI/gateway work before native lands
      native/
        windows-bridge.cpp     # Win32 (Node-API)
        macos-bridge.mm        # Quartz/CoreGraphics/AX (Node-API, Obj-C++)
        binding.gyp
    tasks/
      registry.ts              # Scripted workflows (3 at launch)
      types.ts
    models/
      router.ts                # App-side provider/model routing → gateway
      types.ts                 # GuidanceResponse etc.
    engine/
      commands.ts              # Command Router (validation, dispatch, rate limits, events)
      shortcuts.ts             # Keyboard summon (P2)
      voice.ts                 # Wake word + voice session (P4)
      animation.ts             # Animation state machine (P4)
    ipc/
      channels.ts              # SINGLE canonical channel list
      schemas.ts               # zod schemas — every IPC payload validated in main
      handlers.ts              # Main-process handlers incl. proposal registry
    mcp/
      connector.ts             # MCP client
      registry.ts              # Known local servers + tool-class map
      session.ts               # JSON-RPC over ws, timeouts, request caps
      types.ts
  gateway/
    server.ts                  # Express, binds 127.0.0.1 ONLY
    auth.ts                    # Per-launch random bearer token
    providers/
      registry.ts              # Provider registry + resolveProvider()
      openrouter.ts
      oauth.ts
      types.ts
    policy/
      critical-tos-gate.ts     # Gate: quiz, pass records, version binding, invalidation
      tos-manifest.ts          # Signed manifest client (versions + question packs)
  mcp-servers/
    fs-server.ts               # P3 — read-only, sandboxed
    system-server.ts           # P3 — info/processes/apps
    browser-server.ts          # P4 — action-class, puppeteer-core attach
  specs/
    click-click.plan.md        # This file
  tests/                       # Mirrors app/ and gateway/ 1:1
  .claude/                     # Agentic Kit (present)
```
- **Mirror references:** `tests/` mirrors source paths 1:1.
- **Architectural constraints:**
  - Renderers are untrusted: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; every inbound IPC payload zod-validated in main
  - One source of truth for channels (`ipc/channels.ts`) and contracts (FS-A) — the raw export's duplicate/conflicting definitions are dead
  - Overlay visualizes only. Panel confirms only. **Only main injects input, and only after confirmation**
  - Gateway and MCP servers are loopback-only child processes sharing a per-launch secret

### Provider Matrix
```text
| Provider                        | Critical ToS | Key Type    | ToS Version / Last Reviewed | Gate Qs Version | Notes                                                                 |
|---------------------------------|--------------|-------------|-----------------------------|-----------------|-----------------------------------------------------------------------|
| OpenRouter                      | yes          | BYO API key | <FILL: first TermLens scan> | <FILL>          | Aggregator — exposes flagged upstreams; see aggregator rule in §6    |
| OpenAI (direct BYO or via OR)   | yes          | BYO API key | <FILL>                      | <FILL>          | Never built-with internally; BYO-key behind its own gate only        |
| Anthropic (BYO)                 | <FILL: scan> | BYO API key | <FILL>                      | <FILL>          |                                                                       |
| Generic OAuth provider          | per-scan     | OAuth token | <FILL>                      | <FILL>          | Registered with gate metadata at onboarding                           |
```
*Empty ToS/Gate columns block gate **activation** for that provider, not development. Populate via TermLens/TOScan scan before enabling any flagged provider for end users.*

---

## 5 · TECH STACK & DEPENDENCIES
- **Language/runtime:** TypeScript 5.x (strict) · Node 20 LTS
- **Desktop:** Electron — overlay window (transparent, always-on-top, click-through, screen-bounds frameless) + panel window (focusable strip)
- **Native bridges:** Node-API addons — Windows: C++ over Win32 · macOS: Objective-C++ over Quartz/CoreGraphics/Accessibility
- **AI gateway:** Express on loopback · `fetch` upstream
- **LLM posture:** OpenAI excluded internally; BYO-key allowed (gate per template Appendix C). OpenRouter primary; provider registry extensible to OAuth providers.
- **Providers:** See Provider Matrix (Critical ToS marked)
- **MCP:** JSON-RPC over `ws`, local child-process servers only
- **Testing:** Vitest · Playwright optional for overlay/panel e2e
- **Build & packaging:** electron-builder (`.exe` NSIS, `.dmg`) — **CI matrix (windows-latest + macos-latest) required**; native addons cannot be cross-compiled from one host
- **Config & secrets:** Electron `safeStorage` → OS keychain. Config files hold non-secret settings only. No `.env` secrets in the shipped app.
- **Pinned deps (audit before add):** `ws`, `zod`, `ps-list` (P3), `puppeteer-core` (P4). Full Puppeteer's bundled Chromium (~170MB) is rejected — attach to the user's Chrome with consent instead.
- **AI Docs to localize:** node-addon-api, Electron security guidelines, Windows.Graphics.Capture, CGEvent/AXUIElement, MCP spec
- **Defaults Appendix:** Template Appendix H applies (no default exports, UTC timestamps; snake_case DB fields n/a until storage exists)

---

## 6 · IMPLEMENTATION NOTES & CONSTRAINTS
- **Hard rules:**
  - No OpenAI internal dependencies — we never BUILD with it; users may BYO-key through the gate
  - Critical ToS Gate enforced for **every** provider flagged in the Provider Matrix, **at the gateway, before any upstream call**
  - **Aggregator rule:** selecting a model that maps to a flagged upstream (e.g., an OpenAI model via OpenRouter) requires a valid pass for **that upstream's** gate, not just the aggregator's. `isFlaggedUpstream(model)` check lives in the gateway router.
  - **Confirmation-always:** every automation action (click / keys / focus / browser action) requires explicit per-action user confirmation — **including actions requested via MCP tool calls**. No exceptions, no "trusted" origins.
  - Tool classes (`read_only` vs `action`) are enforced server-side in the gateway/MCP layer — never by prompt alone
  - No workaround if fix ≤10 minutes
  - Overlay never receives input capability; panel never injects input; only main does, post-confirmation
  - No secrets in config files, logs, renderer processes, or IPC payloads
- **Edge cases:**
  - Multi-monitor + DPI scaling: coordinates normalized per display; out-of-bounds model coordinates are **clamped and flagged** ("point unavailable"), never blindly animated to
  - Stale coordinates: if the target window/title no longer matches, the step renders text-only
  - Unsupported platform (e.g., Linux v1): `createPlatformBridge()` throws typed `UnsupportedPlatformError`; app runs guide-text-only mode
  - macOS permissions denied (Accessibility / Screen Recording): feature-degrade with clear UI + deep-link to System Settings — never crash
  - ToS manifest unreachable: last-known version honored ≤30 days, then warn and soft-lock **new** gate passes (existing passes keep their version binding)
  - Model returns malformed guidance JSON: zod-reject → one reformat retry → visible failure to the user
- **Failure Modes:**
  - Gate passes but key activation fails → log attempt, surface to user, do NOT auto-retry
  - Provider ToS ambiguous → escalate to human review
  - Native addon fails to load → fall back to mock bridge + visible banner (guide-only mode), never silently
- **Red Flags (stop & escalate):**
  - Missing test coverage for critical path
  - Key-handling logic touching logs
  - Unpinned dependency added
  - Provider marked Critical ToS but gate missing
  - Gate pass not bound to a ToS version (template Appendix C invalidation rule)
  - **Any action tool callable without a confirmation round-trip**
  - **Any service binding beyond 127.0.0.1**

---

## 7 · SECURITY HARDENING
- **Secrets:** OS keychain via `safeStorage`; dev-only non-user secrets in `.env`; never logged, never in renderer context
- **BYO-key:** memory/session-scoped by default; persisted only via keychain with explicit user opt-in + warning; calls go direct-to-provider **from the user's machine** — the key never transits Motion Activated infrastructure. (The local gateway runs on the user's device; MA-hosted endpoints — the ToS manifest — receive zero key material, ever.)
- **Loopback services:** gateway + MCP servers bind `127.0.0.1` only; per-launch random bearer token required on every request (defeats local CSRF / DNS-rebinding against localhost and rogue local processes); CORS deny-all
- **Electron:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; typed `contextBridge` preload is the only renderer API; CSP on both renderers; navigation + `window.open` blocked; remote module off
- **IPC:** every message zod-validated in main (`ipc/schemas.ts`). Confirmation flow uses main-issued `proposalId` — the renderer can only approve/deny an existing proposal; it can **never** submit raw input payloads (closes the raw export's `AUTOMATION_CONFIRM` hole)
- **Injection surfaces:** model output, DOM content, and screen content are untrusted. `textContent` only (no `innerHTML` with model data); coordinate clamping; step count cap (≤12); the confirmation-always rule is the prompt-injection backstop
- **fs MCP tools:** allowlisted roots; canonical-path prefix checks (symlink-safe via `realpath`); denylist for dotfiles, keychains, `.ssh`, browser profiles; result + file-size caps; async traversal with depth/time budget (the raw export's sync recursive home-dir walk is dead)
- **Screen capture:** off by default; per-session or per-request consent; a consent flag is required before any image leaves the app; active-window vs full-screen is the user's choice
- **Rate limiting:** gateway per-route, MCP per-tool, Command Router per-source; backoff on repeated errors
- **Input validation:** all gateway routes zod-validated; `sendKeys` accepts a whitelist of key tokens only — no raw scancodes from model output
- **Dependency audit:** `npm audit` + lockfile pinning in CI; every new dep justified in the PR
- **Damage-control hook:** active
- **Threat note (top 3):**
  1. Prompt-injected action requests (via screen/DOM content) → confirmation-always + server-side tool classes
  2. Local-service abuse (other processes / browser pages hitting localhost) → loopback bind + bearer token
  3. Key exfiltration → keychain-only storage, no-log rule, direct-to-provider calls

---

## 8 · EXECUTION WORKFLOW
**[PURPOSE]** Ship Click Click in four independently demo-able, independently green phases.
**[VARIABLES]** `PLAN_PATH=specs/click-click.plan.md` · `FEATURE_NAME=click-click` · `PHASE=<1–4>`
**[INSTRUCTIONS]** Follow §6/§7 + template security baseline. Tests-first on all security-critical code (gate, auth, sandbox, IPC schemas, proposal flow).

**[WORKFLOW]**
1. `/prime`
2. Create branch `feat/click-click-phase-<N>`
3. Scaffold files per §4 (phase-relevant paths only)
4. Implement in slice order below — **do not advance on red**
5. Tests green → lint → type-check → human checkpoint if scheduled (§11)
6. Commit convention: `feat(click-click): <slice> [P<N>]`
7. Report per §13

### Phase 1 — Windows MVP *(2–3 days)*
- **1.1** Repo scaffold + toolchain + CI skeleton (win + mac matrix, native build job stubs)
- **1.2** FS-A contracts + zod schemas + canonical channels — **tests first**
- **1.3** Mock platform bridge (unblocks every other slice)
- **1.4** Overlay engine: buddy cursor mirror + step rendering
- **1.5** Panel v1: collapsed strip, hover-expand, text input, provider dropdown; summon = `Ctrl+Shift+Space` (see FS-E note on double-Ctrl)
- **1.6** Gateway: auth token, `/chat`, provider registry, OpenRouter, **Critical ToS Gate + manifest client**
- **1.7** Task registry (3 scripted tasks) + end-to-end guidance flow on mock bridge
- **1.8** Windows native addon (cursor/move/click/keys/focus/capture) + wrapper + safety tests
- **1.9** `.exe` packaging + Phase 1 DoD check

### Phase 2 — macOS parity + assist mode *(2–3 days)*
- **2.1** macOS native addon + TCC permission flows
- **2.2** Capture consent UX + `/vision` route
- **2.3** Automation proposal/confirm loop live (assist mode)
- **2.4** Command Router core + keyboard shortcuts
- **2.5** `.dmg` packaging

### Phase 3 — MCP read-only tools *(1–2 days)*
- **3.1** `mcp/session|connector|registry`
- **3.2** `fs-server` (sandboxed) + `system-server`
- **3.3** Gateway `/mcp/tool` + server-side tool-class enforcement
- **3.4** Model tool-call loop (call → result → follow-up)
- **3.5** Panel MCP server toggles

### Phase 4 — Voice, animation, browser *(3–4 days)*
- **4.1** Wake word **"Hey Click Click"** + press-to-talk override
- **4.2** Voice session manager (mic consent, indicator, timeout, cancel) + intents → Command Router
- **4.3** Animation state machine: `idle / listening / thinking / executing / success / error`
- **4.4** `browser-server` via puppeteer-core attach — **action-class, confirm-gated**
- **4.5** Double-Ctrl summon via low-level key hook if feasible; otherwise keep the chord

**[REPORT]** Use §13 format.

---

## 9 · CLOSED-LOOP SELF-VALIDATION
- **Test command:** `npm test` (Vitest) · `npm run lint` · `npm run typecheck`
- **Coverage Map:** Gate + gateway auth + fs sandbox + IPC schemas + proposal flow = **100%** · routers/registries/bridge wrappers ≥90% · UI logic ≥70%
- **PostToolUse hook:** lint, type-check, format
- **Stop hook:** block finish while tests red
- **Visual confirmation:** per-phase demo script (`docs/demo-P<N>.md`) — overlay mirror, one guided task end-to-end, one confirm-gated click, gate quiz pass + simulated ToS-version expiry
- **Security suite (must-pass, runs every phase):**
  - Path traversal + symlink escape rejected by fs sandbox
  - Requests without the loopback bearer token rejected (gateway + MCP)
  - Malformed / unauthorized IPC payloads rejected by zod layer
  - Action tool call without a confirmed proposal rejected
  - Gate pass expires when `tos_version` changes (simulated manifest bump)
  - Log grep proves no key material ever written
- **Definition-of-Done:** §14

---

## 10 · SUB-AGENT / PARALLELIZATION PLAN
- **Scout:** Haiku 4.5 — API deltas (Electron/Win32/CG/AX/MCP), dependency audits, ToS clause summaries feeding gate-question generation
- **Planner:** Opus 4.8 — per-phase slice refinement only; architecture is pinned in this document
- **Builder:** Sonnet 4.6 — slice implementation
- **Validator:** Sonnet 4.6 — **runs in a fresh context/worktree, never the Builder session continuing** (template §10)
- **Worktrees:** N = 2 (Builder + Validator). After slice 1.2 lands the contracts, UI slices (1.4/1.5) and gateway slice (1.6) parallelize cleanly.

---

## 11 · MEMORY & LOGGING PLAN
- **Logged:** decisions, tool calls, validation results, gate attempts (**outcome + `tos_version` only** — never answers, never keys)
- **Location:** app runtime → rotating local file in `logs/`, user-inspectable · build decisions → `.claude/memory`
- **Retention:** redact secrets; no screen images; no voice transcripts by default

### Human Review Points
- After scaffolding (slice 1.1)
- After ToS question generation (gate question packs, before activation)
- Before merge (every phase)

---

## 12 · SAFETY NET & ROLLBACK
- **Hooks installed:** PostToolUse, Stop, damage-control
- **Kill switch:** global hotkey `Ctrl+Alt+Backspace` → instantly disable all automation, hide overlay, mute mic. Tray "Quit Click Click" always available. *(The raw export had no kill switch — added.)*
- **Rollback procedure:** per-phase branches; `git revert` the phase merge commit; packaged builds are versioned so users can reinstall N-1
- **Blast radius:** the user's own machine only — no cloud state. Worst case is unwanted local input events, mitigated by confirmation-always + kill switch.

---

## 13 · REPORT / OUTPUT CONTRACT
```md
## Summary
- Files changed: <list>
- Tests: <pass/fail counts>
- Security checks run: <list>
- Open risks: <list>
- Rollback: <one-line>
```

---

## 14 · DEFINITION OF DONE

### Phase 1 (Windows MVP)
- [ ] Overlay is transparent, always-on-top, click-through; buddy cursor mirrors system cursor
- [ ] 3 guided tasks render steps and animate the buddy cursor
- [ ] Panel: summon, expand, text input, provider selection
- [ ] Gateway routes to OpenRouter with a BYO key (memory-scoped)
- [ ] **Critical ToS Gate live:** quiz from flagged clauses, 100% threshold, pass record bound to current `tos_version`, expiry on version change (simulated)
- [ ] Windows native addon passes wrapper + safety tests
- [ ] `.exe` installs and runs on a clean Windows machine
- [ ] Tests green · linter clean · security suite green
- [ ] Logs written, no raw keys (grep-verified)
- [ ] Rollback documented · report delivered

### Phase 2
- [ ] macOS parity incl. TCC permission flows · [ ] capture consent + `/vision` · [ ] confirm-gated automation live · [ ] `.dmg` builds

### Phase 3
- [ ] MCP read-only tools pass sandbox tests · [ ] tool-class enforcement proven (action call without confirmation = rejected)

### Phase 4
- [ ] "Hey Click Click" + press-to-talk · [ ] animation state machine with valid-transition tests · [ ] browser tools confirm-gated

*All phases additionally inherit the template §14 checklist (gate verified against current ToS version, security checklist, rollback, report).*

---
---

# FEATURE SPEC — CANONICAL CONTRACTS

## FS-A · Canonical TypeScript Contracts
*Single source of truth. The Builder scaffolds these verbatim; zod schemas in `ipc/schemas.ts` and `gateway/` are generated alongside and are the enforcement layer.*

```ts
// app/platform/index.ts
export interface CursorPos { x: number; y: number; display?: number }
export type ClickType = 'left' | 'right' | 'middle';
export type CaptureScope = 'active-window' | 'full-screen';

export interface PlatformBridge {
  getCursorPos(): CursorPos;
  moveCursor(pos: CursorPos): void;
  click(type: ClickType): void;
  sendKeys(sequence: string[]): void;                    // whitelisted tokens only, e.g. ['CTRL','SHIFT','ESC']
  captureScreen(scope: CaptureScope): Promise<Buffer>;   // caller MUST hold capture consent
  focusWindow(title: string): void;
}
export function createPlatformBridge(): PlatformBridge;  // win32 | darwin | mock | throws UnsupportedPlatformError
```

```ts
// app/tasks/types.ts
export type TaskId =
  | 'change-audio-output'
  | 'clear-browser-cache'
  | 'open-task-manager'
  | 'open-activity-monitor';

export interface TaskStepPoint { x: number; y: number; display?: number }

export interface TaskStep {
  id: string;
  text: string;                 // "Open Settings"
  hint?: string;                // "Click the gear icon"
  point?: TaskStepPoint;
  actionType?: 'keys' | 'click' | 'focus' | 'none';
  keys?: string[];
  clickType?: ClickType;
  targetWindowTitle?: string;
}

export interface TaskDefinition {
  id: TaskId;
  goal: string;
  platform: 'windows' | 'macos' | 'both';
  steps: TaskStep[];
}
```

```ts
// app/models/types.ts
export interface GuidedStep { text: string; point?: TaskStepPoint }

export interface GuidanceResponse {
  steps: GuidedStep[];          // cap: 12 — enforced by zod
  mode: 'guide' | 'assist';
  actions?: ProposedAction[];   // assist mode only; each becomes a proposal, never auto-executes
}
// Validated by zod at the gateway AND again in main before overlay dispatch.
// Points clamped to display bounds; malformed → one reformat retry → visible failure.
```

```ts
// app/ipc/schemas.ts — proposal flow (zod is the source of truth; interfaces shown for reference)
export interface ProposedAction {
  actionType: 'keys' | 'click' | 'focus';
  keys?: string[];
  point?: TaskStepPoint;
  clickType?: ClickType;
  targetWindowTitle?: string;
  description: string;          // human-readable, shown in the confirmation UI
}

export interface AutomationProposal {
  proposalId: string;           // issued by MAIN; main stores the action in its registry
  action: ProposedAction;
  origin: 'model' | 'task' | 'mcp';
}

export interface AutomationDecision {
  proposalId: string;
  approved: boolean;            // renderer may ONLY send this — never raw action payloads
}
```

```ts
// app/ipc/channels.ts — the ONLY channel list in the codebase
export const IPC_CHANNELS = {
  CURSOR_POS_UPDATE:       'cursor-pos-update',        // main → overlay (~30–60Hz, change-detected)
  GUIDANCE_UPDATE:         'guidance-update',          // main → overlay
  AUTOMATION_PROPOSAL:     'automation-proposal',      // main → panel
  AUTOMATION_DECISION:     'automation-decision',      // panel → main
  AUTOMATION_RESULT:       'automation-result',        // main → panel/overlay
  SCREEN_CAPTURE_REQUEST:  'screen-capture-request',   // panel → main (consent flow)
  SCREEN_CAPTURE_RESPONSE: 'screen-capture-response',  // main → panel
  PANEL_STATE:             'panel-state',
  MCP_SERVERS_UPDATE:      'mcp-servers-update',
} as const;
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
```

```ts
// app/engine/commands.ts
export interface Command {
  id: string;                                   // allowlisted command IDs only
  source: 'voice' | 'keyboard' | 'system';
  payload: Record<string, unknown>;
  timestamp: number;
}
// Router responsibilities: validate against allowlist → dispatch to handler →
// emit events (animation hooks, logging: source/latency/result) → per-source rate limiting.
// Registry immutable in production builds.
```

```ts
// gateway/policy — gate pass record (template Appendix C, verbatim)
// { user_or_device_id, provider, tos_version (hash or effective date), questions_version, timestamp }
// Key unlock is scoped to provider + tos_version — never to the provider in perpetuity.
```

---

## FS-B · Platform Bridge API Maps
*The raw export's C++/Obj-C snippets are condensed to authoritative API mappings. Scout verifies current-OS specifics before slice 1.8 / 2.1.*

**Windows (`windows-bridge.cpp`, Node-API/C++):**

| Bridge fn | Win32 API | Notes |
|---|---|---|
| `getCursorPos` | `GetCursorPos` | |
| `moveCursor` | `SendInput` (`MOUSEEVENTF_MOVE\|ABSOLUTE`) | Normalize to 0–65535 per display |
| `click` | `SendInput` (down + up pair) | left/right/middle |
| `sendKeys` | `SendInput` (`INPUT_KEYBOARD`) | Token→VK map in native; tokens whitelisted in TS |
| `captureScreen` | Windows Graphics Capture (D3D11) | GDI fallback for older builds; encode PNG via WIC; returns base64 |
| `focusWindow` | `FindWindow` + `SetForegroundWindow` | Title match; handle foreground-lock quirks |

**macOS (`macos-bridge.mm`, Node-API/Obj-C++):**

| Bridge fn | macOS API | Notes |
|---|---|---|
| `getCursorPos` | `CGEventCreate` + `CGEventGetLocation` | |
| `moveCursor` | `CGEventCreateMouseEvent` + `CGEventPost` | `kCGHIDEventTap` |
| `click` | mouse down/up event pair | |
| `sendKeys` | `CGEventCreateKeyboardEvent` | keycode map in native |
| `captureScreen` | `CGWindowListCreateImage` | **Scout: check ScreenCaptureKit requirement on macOS 14+**; encode via ImageIO; base64 |
| `focusWindow` | `AXUIElementSetAttributeValue` (`kAXFrontmostAttribute`) | AppleScript `activate` fallback — **parameterized app name only, no script string injection** |

**Native module constraints (both OSes, enforced by code review + safety tests):** no registry access, no filesystem writes/deletes, no process termination, no shell execution, no network calls, no private APIs.

**macOS TCC:** Accessibility (input/focus) + Screen Recording (capture) permissions required — first-run flow prompts, degrades gracefully, deep-links to System Settings.

---

## FS-C · Gateway Spec
- **Bind:** `127.0.0.1`, ephemeral or configured port; per-launch random bearer token generated by main, injected into renderers via preload and into child servers via env. Every request without it → 401.
- **Routes:** `POST /chat` · `POST /vision` · `POST /mcp/tool` · `GET/POST /gate/*` (status, quiz fetch, submit)
- **Enforcement order on `/chat` and `/vision`:**
  1. Bearer auth
  2. Gate check: valid pass for `(provider, current tos_version)` — 403 `gate_not_passed` otherwise
  3. **Aggregator check:** if the selected model maps to a flagged upstream, require that upstream's pass too
  4. `resolveProvider()` → upstream call → normalize to `GuidanceResponse` (zod) → return
- **Provider registry (`providers/registry.ts`):** `{ id, name, baseUrl, authStyle: 'bearer'|'oauth', critical_tos: boolean, flaggedUpstreamMap?: (model) => providerId | null }`
- **Gate mechanics:** per template Appendix C v1.1 — 1–2 MCQs (3 max) generated from the flagged clauses; **100% threshold**; Critical ToS Warning + link to the full TermLens/TOScan flagged-clause breakdown shown before the quiz; on fail: name the topic missed (never the answer), rotate/reshuffle from the pool, re-display warning, allow retake, log attempt count. Informed consent + liability posture, not fortress security — no hard lockout.
- **Pass records:** schema in FS-A; stored locally (localStorage acceptable for the client-only quiz UX; gateway keeps its own authoritative copy). Unlock scoped to `provider + tos_version`.
- **Invalidation (load-bearing):** on manifest version change for a provider, **all** existing passes for that provider expire immediately; key disabled until re-pass against regenerated questions.
- **ToS manifest (`policy/tos-manifest.ts`):** the app fetches a **signed manifest** (provider → `tos_version` hash/effective-date + question-pack version) from a static Motion Activated endpoint. This operationalizes the "ToS crawler" for a local-first desktop app. **Zero key material ever touches this endpoint.** Offline policy: honor last-known ≤30 days, then warn + soft-lock new passes. Signature verified against a pinned public key.
- **Logging:** attempt outcomes + `tos_version` only. Never key material, never quiz answers.
- **Failure mode:** gate passes but key activation fails → log, surface, do NOT auto-retry.

---

## FS-D · MCP Integration Spec *(Phase 3; browser Phase 4)*
- **Topology:** MCP servers are local child processes spawned by main; each binds `127.0.0.1` on an ephemeral port, reports the port back on a stdout handshake, and requires the per-launch shared secret on every JSON-RPC call.
- **Registry (`mcp/registry.ts`):**
```ts
export interface McpServerConfig {
  id: 'local-fs' | 'system-tools' | 'browser-tools' | string;
  name: string;
  url: `ws://127.0.0.1:${number}`;                       // resolved at spawn, never hardcoded
  toolClass: Record<string, 'read_only' | 'action'>;     // enforced server-side in the gateway
}
// No auth tokens in source. Ever. (The raw export's `token: ''` field is dead.)
```
- **Tool classes:**
  - `read_only` — executes after gate/auth checks, no confirmation: `fs.search`, `fs.readFile`, `fs.listDir`, `system.info`, `system.processes`, `system.apps`, `browser.getDom`
  - `action` — **must** round-trip through main's proposal/confirm flow before execution: `browser.open`, `browser.click`, `browser.type` (and any future input-adjacent tool)
- **fs sandbox rules:** allowlisted roots (user-selected folders; default Documents/Downloads/Desktop); `realpath` canonicalization + prefix check (symlink-safe); denylist (`.ssh`, keychains, browser profiles, dotfiles by default); `fs.readFile` size cap (1MB, UTF-8 only); `fs.search` async with depth/time/result budgets.
- **Session (`mcp/session.ts`):** JSON-RPC over `ws`; request timeout; max in-flight cap; pending-map cleanup on timeout/close (the raw export leaked resolvers).
- **Tool-call loop:** model returns `{ toolCall }` (structured, zod-validated) → gateway executes (or proposes, if action-class) → result appended as a **`tool` role message** (not `assistant` — the raw export's role was wrong and would corrupt provider context) → follow-up model call → final `GuidanceResponse`.
- **System prompt for tool calling:** as drafted in the export (server/tool listing, "one toolCall object, never mixed with prose"), moved to `gateway/prompts/` and versioned.

---

## FS-E · Panel UI Spec
- **Collapsed strip (default):** ~12–16px wide, ~1.5in tall, left-center default, semi-transparent, glow on hover. **Clickable (not click-through)** — the overlay window stays click-through; these are separate windows.
- **Expanded panel (≤20% screen width):** input box (text + mic icon) · provider dropdown · MCP server checklist · recent interactions (last 5–10) · settings
- **Agent Working popup:** pill bubble near the panel — pulsing dots, "Hold for voice reply / Tap for text reply," auto-hides after reply
- **States:** `Collapsed · Expanded · Listening · Processing · Replying`
- **Transitions:**

| Trigger | From | To |
|---|---|---|
| Hover | Collapsed | Expanded |
| Summon chord | Collapsed | Expanded (input focused) |
| "Hey Click Click" | Any | Listening |
| Input submitted | Expanded | Processing |
| Agent finishes | Processing | Replying |
| Reply done / mouse leaves | Replying / Expanded | Collapsed |

- **Summon triggers:** v1 = `Ctrl+Shift+Space` via Electron `globalShortcut`. **Honest constraint:** double-Ctrl-tap is not supported by `globalShortcut` (chords only) — it needs a low-level keyboard hook, which on Windows means extending the native addon. Scheduled as slice 4.5; the chord ships first.
- **Config:** position presets (6 corners/centers) · auto-collapse delay · voice summon on/off · keyboard summon on/off · agent voice on/off · MCP auto-connect on/off
- **Visual:** glassmorphism, rounded corners, soft shadows, 150–200ms slide animations
- **Flows (canonical, from the export, cleaned):** Text input (chord → type → Enter → collapse → Working popup → spoken/text reply → fade) · Voice input (wake → listen bubble → speak → same tail) · Provider selection (hover → dropdown → auto-collapse 2s idle) · MCP selection (hover → checkboxes → auto-collapse → tool access updated)

---

## FS-F · Voice + Animation Spec *(Phase 4)*
- **Voice pipeline:** KWS wake word ("Hey Click Click", threshold-tuned) → voice session manager (mic consent + visible indicator + silence auto-timeout + ESC/"cancel") → STT → NLU intent mapping (whitelisted intents only; unknown → no command) → Command Router
- **Press-to-talk override** always available; mic-off control always visible
- **Privacy:** no raw audio stored; transcripts not logged by default (opt-in, anonymized, configurable retention)
- **Animation state machine:** `idle → listening → thinking → executing → success | error → idle`. Valid-transition table enforced and unit-tested (e.g., `success → thinking` disallowed; `error → idle` fallback required). Hooks: `onWake`, `onTranscriptReady`, `onCommandStart`, `onCommandEnd`.
- **Rendering:** buddy cursor + panel micro-animations first; avatar/blendshape streaming is out of scope for v1 (revisit post-Phase 4).
- **Test plan (carried from export):** KWS false-positive threshold test · NLU mapping + unknown-phrase test · full voice→router→animation integration · cancel path · keyboard and voice commands drive identical animation paths · mic-denied graceful failure · shortcut flood rate-limited · production registry immutable.

---

## FS-G · Consolidation Change Log — the honest record
*What changed between the raw export and this plan, and why. Items 3–9 are security-load-bearing.*

1. **Unified 11 pasted chat exports** into one canonical plan; deleted three conflicting IPC/overlay/gateway definitions and all duplicated code dumps (contracts now live once, in FS-A).
2. **Naming normalized:** wake word "Hey Nova" → **"Hey Click Click"**; product = Click Click; feature id = `cross-platform-screen-agent`.
3. **Closed the plan's central contradiction:** SP1 required per-action confirmation, but the MCP tool-calling loop executed `browser.click`/`browser.type` with zero confirmation. Fix: server-side tool classes + confirmation-always (§6, FS-D).
4. **Localhost hardening:** the export exposed unauthenticated services on 8787/9001–9003 — any local process or malicious web page could drive them. Fix: loopback bind + per-launch bearer token everywhere (§7).
5. **fs tools sandboxed:** raw `fs.readFile`/`fs.search` allowed arbitrary file reads and a synchronous recursive walk of the entire home directory. Fix: allowlist roots, realpath checks, denylist, caps, async traversal (FS-D).
6. **Confirmation payload hole closed:** raw `AUTOMATION_CONFIRM` executed whatever payload the renderer sent. Fix: main-issued `proposalId` model — renderers approve/deny only (FS-A).
7. **Secrets posture fixed:** export embedded `token: ''` in source and hand-waved "encrypted file" storage. Fix: OS keychain via `safeStorage` only; config never holds secrets; template §7 BYOK rules applied (memory/session default, direct-to-provider, never transits MA infra).
8. **Electron hardening specified:** export implied `window.electron.ipc` with no preload and no security flags. Fix: contextIsolation/sandbox/no-nodeIntegration + typed contextBridge + CSP + IPC zod layer. Also: overlay `fullscreen: true` → screen-bounds frameless window (avoids the macOS Spaces bug) with `setIgnoreMouseEvents(true, { forward: true })`.
9. **Aggregator gate rule added:** OpenAI models are reachable through OpenRouter; without a model→upstream check, the OpenAI gate was bypassable. Now required in the gateway (§6, FS-C).
10. **ToS invalidation made operational** for a local-first desktop app via a signed, key-material-free manifest endpoint (FS-C) — the template's Appendix C "crawler" otherwise had no mechanism here.
11. **Scope phased honestly:** voice/animation/browser moved to Phase 4; the export's "ship by early AM" pressure was incompatible with a two-native-addon, four-surface build and was dropped.
12. **Double-Ctrl summon flagged as not natively supported** by Electron `globalShortcut` → chord ships in P1, low-level hook in P4 (FS-E).
13. **Model coordinates no longer trusted:** clamping + staleness handling added (export animated blindly to model-provided points).
14. **Puppeteer → puppeteer-core** attach-to-user-Chrome with consent (P4); avoids shipping a ~170MB bundled Chromium and matches NG5.
15. **Tool-result role fixed** in the follow-up loop (`assistant` → `tool`) so provider context isn't corrupted (FS-D).
16. **Kill switch added** (§12) — the export had none.
17. **Cursor IPC noted** at 30–60Hz with change detection instead of a blind 16ms `setInterval`.

### Open items (need Kyle, not Code)
- **Run TermLens/TOScan scans** to fill the Provider Matrix ToS/Gate columns — blocks gate *activation* only, not development.
- **Stand up the signed ToS-manifest endpoint** (static JSON + signature on any host you already run; ~30-minute task) and pin its public key.
- **Inline template Appendices A, B, D–G** into CODE_PLAN_TEMPLATE.md — your own v1.1 patch flags this; §2 of this plan carries an assumption until it's done.
- **Approve** (flip §0 status) and confirm Windows-first is right — I defaulted to it since every concrete path in your export was a Windows box.
