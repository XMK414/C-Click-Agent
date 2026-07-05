// app/overlay/cursor-mirror.ts — pure, no DOM. Slice 1.4.
//
// Change-detection + throttle over a stream of raw cursor positions. Kills the
// raw export's blind 16ms `setInterval`: a position is only worth sending to the
// overlay (CURSOR_POS_UPDATE) if it moved beyond a pixel threshold, and emits are
// rate-capped so a fast mouse can't flood IPC.
//
// Time is passed in explicitly (`atMs`) rather than read from Date.now() so this
// stays pure and deterministic under test.

import type { CursorPos } from '../platform/index.js';

export interface CursorMirrorOptions {
  /** Minimum straight-line distance (px) to count as "moved". */
  pxThreshold?: number;
  /** Floor between emits, in ms — caps the emit rate (~30–60Hz band). */
  minIntervalMs?: number;
}

export interface CursorMirror {
  /** Feed a raw sampled position; returns the position to emit, or null to suppress. */
  feed(pos: CursorPos, atMs: number): CursorPos | null;
}

const DEFAULT_PX_THRESHOLD = 2;
const DEFAULT_MIN_INTERVAL_MS = 20; // ~50Hz, inside the required 30–60Hz band

export function createCursorMirror(options: CursorMirrorOptions = {}): CursorMirror {
  const pxThreshold = options.pxThreshold ?? DEFAULT_PX_THRESHOLD;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const thresholdSq = pxThreshold * pxThreshold;

  let last: CursorPos | null = null;
  let lastEmitAt: number | null = null;

  return {
    feed(pos: CursorPos, atMs: number): CursorPos | null {
      if (last !== null) {
        const dx = pos.x - last.x;
        const dy = pos.y - last.y;
        if (dx * dx + dy * dy < thresholdSq) {
          return null; // sub-threshold: not a real move
        }
      }
      // Update the change-detection baseline regardless of whether the emit
      // itself gets throttled below, so the next comparison is against the
      // freshest known position, not a stale one.
      last = pos;

      if (lastEmitAt !== null && atMs - lastEmitAt < minIntervalMs) {
        return null; // real move, but too soon since the last emit
      }
      lastEmitAt = atMs;
      return pos;
    },
  };
}
