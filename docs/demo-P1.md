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

There is no build step yet (Electron's TS loader isn't wired up in this
slice) — the quickest way to see it live is to transpile once with `tsc` and
copy the static overlay/panel assets alongside the output, then launch
Electron directly. Electron 43 loads an ESM `main.js` natively (this repo is
`"type": "module"`), so there's no need to force `--module commonjs`:

```
npx tsc -p tsconfig.json --outDir dist --noEmit false   # tsconfig.json sets noEmit:true; override it here
cp app/overlay/overlay.html app/overlay/styles.css app/overlay/cursor-states.css dist/app/overlay/
cp -r app/overlay/assets dist/app/overlay/
cp app/panel/panel.html app/panel/styles.css dist/app/panel/
cp -r gateway/policy/fixtures dist/gateway/policy/   # the signed manifest is data, not TS — tsc won't copy it
npx electron dist/app/main.js
```

(A proper `dev`/`build` script lands with the packaging slice later in Phase 1;
this is the manual path for now.)

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
