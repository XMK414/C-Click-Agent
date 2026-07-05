// tests/overlay/cursor-mirror.test.ts

import { describe, it, expect } from 'vitest';
import { createCursorMirror } from '../../app/overlay/cursor-mirror.js';

describe('createCursorMirror', () => {
  it('emits the first fed position', () => {
    const mirror = createCursorMirror();
    expect(mirror.feed({ x: 0, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
  });

  it('suppresses a sub-threshold move', () => {
    const mirror = createCursorMirror({ pxThreshold: 5, minIntervalMs: 0 });
    mirror.feed({ x: 100, y: 100 }, 0);
    const result = mirror.feed({ x: 101, y: 100 }, 100); // 1px move, well under threshold
    expect(result).toBeNull();
  });

  it('emits a real (above-threshold) move once', () => {
    const mirror = createCursorMirror({ pxThreshold: 5, minIntervalMs: 0 });
    mirror.feed({ x: 100, y: 100 }, 0);
    const result = mirror.feed({ x: 200, y: 100 }, 100);
    expect(result).toEqual({ x: 200, y: 100 });
  });

  it('throttles a burst of above-threshold moves to the rate cap', () => {
    const mirror = createCursorMirror({ pxThreshold: 1, minIntervalMs: 20 });
    const emitted: Array<{ x: number; y: number } | null> = [];
    // 10 moves, 5ms apart, each well beyond threshold — far faster than the 20ms cap.
    for (let i = 0; i < 10; i += 1) {
      emitted.push(mirror.feed({ x: i * 10, y: 0 }, i * 5));
    }
    const nonNull = emitted.filter((e) => e !== null);
    // At 5ms/step over 45ms total with a 20ms floor, at most ~3 emits should get through.
    expect(nonNull.length).toBeLessThan(emitted.length);
    expect(nonNull.length).toBeGreaterThan(0);
  });

  it('resumes emitting once enough time has passed since the last emit', () => {
    const mirror = createCursorMirror({ pxThreshold: 1, minIntervalMs: 20 });
    expect(mirror.feed({ x: 0, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(mirror.feed({ x: 10, y: 0 }, 5)).toBeNull(); // throttled
    expect(mirror.feed({ x: 20, y: 0 }, 25)).toEqual({ x: 20, y: 0 }); // 25ms since last emit
  });

  it('does not emit repeatedly for the same stationary position', () => {
    const mirror = createCursorMirror({ pxThreshold: 2, minIntervalMs: 0 });
    mirror.feed({ x: 0, y: 0 }, 0);
    expect(mirror.feed({ x: 0, y: 0 }, 10)).toBeNull();
    expect(mirror.feed({ x: 0, y: 0 }, 20)).toBeNull();
  });
});
