# Demo — Phase 1 (Slices 1.4, 1.5)

This walks through running the overlay window + panel, mirroring the real
cursor, cycling the buddy cursor's 6 states, and running the gate quiz UX end
to end against the real gateway. Everything here is manual/visual — the core
CI lane stays Electron-free (pure-logic + jsdom tests only), so this doc is
how these slices get validated end-to-end on a real display.

## Prerequisites

```
npm install
npm run verify   # must be green before you run the demo
```

## Run it

There is no packaged build step yet, but `scripts/build-e2e.mjs` (originally
written for the Playwright e2e lane) does everything needed to run the app
live, so reuse it rather than hand-rolling the same steps twice:

```
node scripts/build-e2e.mjs   # tsc + static-asset copy + two required bundling steps (see below)
npx electron dist-e2e/app/main.js
```

Two non-obvious things that script handles, both real bugs the e2e harness
caught (not just build trivia):
- `app/preload.ts` is bundled to CommonJS via esbuild, because Electron's
  **sandboxed** preload loader (`sandbox: true`, mandatory) cannot parse ES
  module `import` syntax at all — a plain `tsc` ESM build means
  `window.clickclick`/`clickclickPanel` are never defined, silently.
- `app/overlay/overlay.ts` and `app/panel/panel.ts` are bundled to browser ESM
  via esbuild too, because a `<script type="module">` loaded from a `file://`
  page can't resolve a bare npm specifier like `zod` (no `node_modules`
  resolution in a browser) — `panel.ts` pulls in `zod` transitively via
  `app/ipc/schemas.ts`.

(A proper `dev`/`build` script for actual packaging lands with the packaging
slice later in Phase 1; this is the manual/demo path for now.)

## What you should see

1. **A fullscreen, transparent, click-through overlay** appears with no
   window frame, no taskbar entry, and no border. Clicking or typing anywhere
   on the desktop behaves exactly as if the overlay weren't there — this is
   `setIgnoreMouseEvents(true, { forward: true })` at work.
2. **The buddy cursor mirrors your real mouse pointer** almost immediately —
   move the mouse and the glowing dot follows. Under the hood this is
   `screen.getCursorScreenPoint()` polled every ~16ms in `app/main.ts`, fed
   through `app/overlay/cursor-mirror.ts`'s change-detection + throttle so the
   overlay only gets an update when the pointer actually moved and no more
   often than the ~30–60Hz cap — not a raw 16ms firehose.
3. **After ~3 seconds, two guidance steps render** near the top-left area of
   the primary display ("Open Settings", `Click "Sound"`) — this is the
   dev-only `startDevGuidanceDemo()` hook in `app/main.ts` pushing a sample
   `GuidanceResponse` through the *real* validation path: `guidanceResponseSchema`
   in main, then `buildRenderModel()` clamping/capping against the actual
   display layout, before the already-safe `RenderModel` is sent to the
   overlay. The overlay renders step text via `textContent` only — open
   devtools on the overlay window and confirm there is no `<img>`/`<script>`
   in `#steps-container`, even if you edit the sample guidance in
   `startDevGuidanceDemo` to include HTML-looking text.
4. **The buddy cursor cycles through all 6 states every 2 seconds**: `idle →
   listening → thinking → executing → success → error → idle …`. Each state
   has a distinct color *and* a distinct motion/shape cue (breathing, pulse,
   shimmer, directional pulse, pop, shake) so the state is legible without
   relying on color alone — see `app/overlay/cursor-states.css`. This is the
   dev-only `startDevStateCycler()` hook in `app/main.ts`; it only runs when
   `NODE_ENV !== 'production'`.
5. Try **reduced-motion**: enable "reduce motion" in your OS accessibility
   settings and reload the overlay — the state colors/glow still change, but
   the animations stop, per the `prefers-reduced-motion` rule in
   `cursor-states.css`.

## Verifying the security properties manually

- Open the overlay's devtools (if you temporarily set `webPreferences.devTools:
  true` for the demo) and confirm `window.require`, `window.process`, and
  `window.clickclick.<anything not listed in OverlayBridge>` are all
  `undefined` — the renderer has no Node access and no raw IPC surface, only
  the three read-only listeners exposed by `app/preload.ts`.
- Try dragging a window under the overlay — it should behave as if the
  overlay isn't there (click-through).
- Resize/move a real window across a display boundary while guidance steps
  are showing — a step point that would fall outside every known display gets
  clamped and marked unavailable by `render-model.ts`, so the buddy cursor
  never animates to a coordinate that doesn't exist.

## Automated coverage (what's actually tested in CI)

- `tests/overlay/render-model.test.ts` — clamping, the 12-step cap, and the
  "no known displays" edge case.
- `tests/overlay/cursor-mirror.test.ts` — sub-threshold suppression, throttle
  cap, and resuming after the cap window passes.
- `tests/overlay/overlay.test.ts` (jsdom) — proves step text renders via
  `textContent` (a `<img onerror=...>` payload renders as literal text, never
  as an `<img>` element), and that `data-state` drives the cursor.

None of the above need a display server — only the manual steps in this doc
do.

---

# Slice 1.5 — Panel v1 + Gate Quiz UX

Once the app is running (see above), a second window exists: the panel — a
thin collapsed strip near the left-center of the primary display. Summon it
with **Ctrl+Shift+Space** (`CommandOrControl+Shift+Space`) or just hover it.

## What you should see

1. **Hover the strip** — it expands into the panel (input box, provider
   dropdown, gate/quiz area, provider-key field, recent list). Move the mouse
   away and it collapses back to a strip. This is `app/panel/panel-state.ts`'s
   state machine (`Collapsed <-> Expanded`) driven purely by DOM hover events —
   no gateway round-trip needed for this part.
2. **The provider dropdown is populated from the real registry** —
   `gateway/providers/registry.ts`'s three launch providers (OpenRouter,
   OpenAI, Anthropic), fetched via `getProviders()` (main reads the registry;
   the panel never imports gateway code directly).
3. **Pick a provider and type a prompt, then press Enter.** Since no gate pass
   exists yet, main's `/gate/status` check comes back locked and the panel
   shows the **real** Critical ToS warning + link for that provider (from the
   2026-07-04 scan, `gateway/policy/provider-tos-content.ts`) and its quiz
   questions — never the answer key.
4. **Answer a question wrong, submit.** You get "missed: `<topic>`" (never the
   correct answer) and a **Retake** button. Retaking re-fetches `/gate/quiz`,
   which rotates/reshuffles the question set (`selectQuestions` + crypto-random
   `randomPick`).
5. **Answer everything correctly, submit.** The gate unlocks — `/gate/submit`
   mints a pass via `gateway/policy/pass-store.ts`, persisted to disk. Press
   Enter again with the same prompt (and a provider key — see below): the
   panel calls `askAgent`, which now passes the gate and reaches
   `/chat` for real.
6. **Enter something in the "Provider key" field** before asking — this is
   your BYO key for that provider. It's held in the input only long enough to
   be sent with the one `askAgent` call; the field is cleared immediately
   after, and the key is never written to disk, never logged (see
   `tests/gateway/server.test.ts`'s "no key material anywhere" suite), and
   never reaches this repo's infra — it goes straight from your machine to the
   provider via the loopback gateway.
7. **Watch the overlay while asking a question** — a successful `/chat`
   response is validated (`guidanceResponseSchema`) and clamped
   (`buildRenderModel`) in main exactly like the dev-guidance demo, then pushed
   to the *overlay* window, not the panel. The panel only shows
   `Processing -> Replying` indicators (via the `PANEL_STATE` channel) and a
   one-line recent-interaction entry.

## Verifying the security properties manually

- Open the panel's devtools and confirm `window.clickclickPanel` has exactly
  the five documented methods (`getProviders`, `askAgent`, `getGateStatus`,
  `getQuiz`, `submitQuiz`, `onPanelState`) — no raw `ipcRenderer`, no token, no
  gateway URL anywhere in scope.
- Try to find the bearer token or the gateway's port/URL in the panel's
  renderer process (devtools console, `window`, network tab) — it isn't there;
  every gateway call is proxied through `ipcMain.handle` in `app/main.ts`.
- Confirm a failed quiz response never contains `correctIndex` anywhere in the
  Network/IPC payload — `redactForClient()` strips it at the gateway, and
  `app/panel/gate-view.ts`'s `toQuizView()` strips it again on the way into the
  render model as defense in depth.

## Automated coverage (slice 1.5)

- `tests/panel/panel-state.test.ts` — every valid transition + rejected
  invalid ones (e.g. `Collapsed -> Replying`).
- `tests/panel/gate-view.test.ts` — quiz view redaction (including a
  rogue-object defense-in-depth case), result view topics-not-answers, retake
  affordance.
- `tests/panel/panel.test.ts` (jsdom) — provider `<select>` populated via
  `textContent`, a malicious warning/prompt renders as literal text (never
  `<img>`/`<script>`), submitting the quiz never transmits/renders
  `correctIndex`, the ask flow calls `askAgent` with exactly `(prompt,
  provider, providerKey)` and clears the key input immediately after.

---

# Slice 2.3 — Proposal / Confirmation Registry (Assist Mode)

Once the app is running, wait ~6 seconds after launch (non-production only) —
the dev hook proposes one sample action so the confirm flow demo has
something to show without a real model/task/MCP integration yet.

## What you should see

1. **The panel forces itself open** — even if you never hovered the strip —
   because a pending confirmation needs your attention now. This is
   deliberate: `app/panel/panel.ts` force-expands the panel on
   `AUTOMATION_PROPOSAL`, regardless of the Collapsed/Expanded hover state.
2. **A concrete action summary appears**, e.g. `Focus window "Settings"` —
   never a vague label like "an action was requested." This is the
   prompt-injection backstop: even an action smuggled in via an injected
   prompt would still be shown verbatim, so you consent (or don't) to the
   real thing.
3. **Approve or Deny.** Approving calls the (mock) `PlatformBridge` exactly
   once — `app/ipc/proposal-registry.ts`'s consume-once guarantee means even
   a resubmitted decision for the same id can never execute twice. Denying
   never touches the bridge at all.
4. Real OS input injection arrives with the native bridges (1.8/2.1); this
   slice proves the confirm-then-execute pathway end-to-end on the mock
   bridge (`app/platform/mock.ts`).

## Verifying the security properties manually

- Open the panel's devtools and confirm there is no way to submit a raw
  action — `window.clickclickPanel.decide` takes only `(proposalId,
  approved)`; there is no method that accepts an action payload.
- The main process (not shown in any devtools) is the only place the actual
  `ProposedAction` ever lives between mint and execute.

## Automated coverage (slice 2.3)

- `tests/ipc/proposal-registry.test.ts` — mint/consume-once/peek/expiry/
  per-origin rate limiting (100% coverage required — this is the security
  core of the confirm flow).
- `tests/ipc/execute-action.test.ts` — the sole execution entrypoint
  re-validates (key-token whitelist, coordinate clamping) even though the
  proposal was already validated once at mint time.
- `tests/ipc/handlers.test.ts` — no execution without a minted proposal,
  consume-once/replay guard, an injected `action` field in a decision payload
  is ignored (zod strips it — the STORED action always executes), deny/expiry
  never reach the bridge, origin-agnostic (model/task/mcp identical
  round-trip).
- `tests/panel/confirm-view.test.ts` — concrete, human-readable summaries per
  action type; the origin's description passes through verbatim.
- `tests/panel/panel.test.ts` (jsdom) — the confirm UI renders via
  `textContent` only, approve/deny call `decide()` with exactly
  `{proposalId, approved}`, a malformed proposal is dropped silently, and the
  panel forces itself visible on a proposal even without a hover.
- `e2e/assist.e2e.ts` — the whole flow proven in the REAL panel window:
  approve executes on the mock bridge exactly once, deny never touches it,
  and a replayed decision for an already-consumed proposal is a no-op.
