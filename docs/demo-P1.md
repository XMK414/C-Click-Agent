# Demo — Phase 1, Slice 1.4 (Overlay Engine + Buddy Cursor)

This walks through running the overlay window, mirroring the real cursor, and
cycling the buddy cursor's 6 states. Everything here is manual/visual — the
core CI lane stays Electron-free (pure-logic + jsdom tests only), so this doc
is how slice 1.4 gets validated end-to-end on a real display.

## Prerequisites

```
npm install
npm run verify   # must be green before you run the demo
```

## Run it

There is no build step yet (Electron's TS loader isn't wired up in this
slice) — the quickest way to see it live is to point `electron` at the
compiled entry points via `tsx`/`ts-node`, or to transpile once with `tsc`:

```
npx tsc -p tsconfig.json --module commonjs --outDir dist   # one-off transpile
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
