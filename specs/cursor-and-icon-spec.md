# FS-F-1 · Cursor & App-Icon Visual Spec
*Companion to `specs/click-click.plan.md` FS-F. FS-F defined the animation state
machine's transitions; this defines what each state LOOKS like, the cursor
geometry, and the icon export matrix. Executable form lives in
`app/overlay/cursor-states.css` + `app/overlay/assets/buddy-cursor.svg`.*

## Decision (locked)
- **Buddy cursor:** the **Gradient-Body Arrow** — a clean pointer-arrow silhouette
  with the brand gradient (cyan → indigo → magenta), a white halo, and a
  state-tinted glow. This is the refined execution of the "Gradient Pulse" concept
  (first sheet #7; appears refined as "Gradient Body" in the 8-Refined sheet and
  as #15 in the 20-Concepts sheet).
- **App / tray icon:** **Negative Space Monolith** (Specific-Iterations sheet #4) —
  a solid mark with the arrow/A-frame carried in negative space.

### Why these, honestly (the constraint that decides it)
A buddy cursor has three hard requirements the pretty concepts mostly fail:
1. **A pointing hotspot.** It replaces/mirrors the system pointer, so it must have
   a sharp tip. This eliminates every *letterform* concept (b / c / d / C shapes)
   — a "c" points at nothing. Those are wordmark material, not cursor material.
2. **Legibility at ~24–32px on any background.** Kills busy interior detail:
   faceted gem, candy-fused, mosaic, woven fiber, distressed concrete, halftone,
   glitch. They turn to mud at cursor scale.
3. **Clean per-state recolor.** State is shown by color (6 states). Only a
   solid/gradient fill retints cleanly. Fixed multi-color textures (candy, mosaic,
   lightning) fight the state system.

The Gradient-Body Arrow is the only family that satisfies all three. The
"glowing stencil" arrows are the fallback if the gradient ever reads busy in
motion. Everything else in the three sheets is app-icon / branding material, not a
cursor. The Negative Space Monolith wins the icon slot because it is the strongest
**monochrome-capable** silhouette (required for a macOS template tray icon) and it
plays the "stable/installed" counterpart to the live, colorful cursor while sharing
the arrow silhouette language.

## Cursor geometry
- **viewBox:** `0 0 24 24`. Base render **24×24 logical px**; ship **1× / 1.5× / 2×**
  raster + the SVG for HiDPI.
- **Hotspot:** the arrow tip at logical **(1, 1)**. When the cursor is applied, set
  this as the hotspot so the tip — not the center — lands on the target.
- **Legibility stack (in order):** white outer halo (2.6px stroke) → gradient body
  → thin near-black inner stroke (0.5px) → state-tinted drop-shadow glow. The halo
  is non-negotiable: it is what keeps the cursor visible on white, black, photo, and
  video backgrounds.
- **Brand gradient (idle):** `#22D3EE` → `#6366F1` → `#D946EF` along the tip→tail
  axis.

## The 6 states (color + REDUNDANT motion cue)
State is never color-only — each has a motion/shape cue so it is colorblind-safe,
and all animation is dropped under `prefers-reduced-motion`.

| State | Color | Motion / shape cue | Meaning | Entry condition |
|---|---|---|---|---|
| **idle** | brand gradient | slow breathing glow (3.2s) | "I'm here" | default / after success or error |
| **listening** | cyan `#22D3EE` | expanding-contracting pulse (1s) | "I hear you" | wake word / mic on |
| **thinking** | violet `#8B5CF6` | left-right shimmer sweep (1.4s) | "Processing" | request sent to gateway |
| **executing** | indigo `#6366F1` | scale-up + directional pulse toward tip | "Acting" | **only after** user confirms an action |
| **success** | green `#22C55E` | single pop (scale 1→1.18→1) | "Done" | action/tool result OK |
| **error** | red `#EF4444` | short horizontal shake | "That failed" | action/tool result failed |

### Valid transitions (enforced + unit-tested in `app/engine/animation.ts`)
```
idle       -> listening | thinking
listening  -> thinking | idle
thinking   -> executing | idle | error
executing  -> success | error
success    -> idle
error      -> idle
```
Disallowed examples (must throw / no-op in the state machine): `success -> thinking`,
`idle -> executing` (executing is only reachable post-confirmation via thinking),
`error -> executing`. `error -> idle` is the required fallback.

## App / tray icon export matrix
- **Full-color mark:** solid dark base with the negative-space arrow; optional
  brand-gradient variant for splash/store.
- **macOS tray:** **monochrome template** (black shape + alpha only) so macOS tints
  it for light/dark menu bars. No gradient in the template.
- **Windows tray:** 16 / 20 / 24 / 32 px; ship a multi-resolution `.ico`.
- **Sizes:** 16, 32, 64, 128, 256, 512, 1024 px PNG · `.ico` (Windows) · `.icns`
  (macOS) · master SVG.
- **Silhouette test:** must remain recognizable at 16px and in pure monochrome.

## Open (design polish, not blocking code)
- Final vector of the Negative Space Monolith at icon sizes (the cursor arrow is
  already vectored and wired; the icon is currently a decision + geometry spec).
- Optional: a subtle idle → "wave" micro-animation when the agent first summons,
  as a personality beat (post-Phase-4).
