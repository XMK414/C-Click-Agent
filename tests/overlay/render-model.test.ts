// tests/overlay/render-model.test.ts

import { describe, it, expect } from 'vitest';
import { buildRenderModel, type DisplayBounds } from '../../app/overlay/render-model.js';
import { MAX_GUIDED_STEPS, type GuidanceResponse } from '../../app/models/types.js';

const PRIMARY: DisplayBounds = { id: 0, x: 0, y: 0, width: 1920, height: 1080 };
const SECONDARY: DisplayBounds = { id: 1, x: 1920, y: 0, width: 1280, height: 720 };

describe('buildRenderModel', () => {
  it('passes a valid, in-bounds guidance through unchanged', () => {
    const guidance: GuidanceResponse = {
      mode: 'guide',
      steps: [{ text: 'Click Save', point: { x: 100, y: 200, display: 0 } }],
    };
    const model = buildRenderModel(guidance, [PRIMARY, SECONDARY]);
    expect(model).toEqual({
      mode: 'guide',
      steps: [{ text: 'Click Save', point: { x: 100, y: 200, display: 0 }, available: true }],
    });
  });

  it('clamps an out-of-bounds point and marks it unavailable', () => {
    const guidance: GuidanceResponse = {
      mode: 'guide',
      steps: [{ text: 'Off screen', point: { x: 5000, y: -50, display: 0 } }],
    };
    const model = buildRenderModel(guidance, [PRIMARY, SECONDARY]);
    expect(model.steps).toEqual([
      { text: 'Off screen', point: { x: 1919, y: 0, display: 0 }, available: false },
    ]);
  });

  it('a step with no point is unavailable with no point field', () => {
    const guidance: GuidanceResponse = { mode: 'guide', steps: [{ text: 'Just narration' }] };
    const model = buildRenderModel(guidance, [PRIMARY]);
    expect(model.steps).toEqual([{ text: 'Just narration', available: false }]);
  });

  it('defaults to the first display when a point omits `display`', () => {
    const guidance: GuidanceResponse = { mode: 'guide', steps: [{ text: 'Step', point: { x: 10, y: 10 } }] };
    const model = buildRenderModel(guidance, [PRIMARY, SECONDARY]);
    expect(model.steps[0]).toEqual({ text: 'Step', point: { x: 10, y: 10, display: 0 }, available: true });
  });

  it('falls back to the first display when the requested display id is unknown', () => {
    const guidance: GuidanceResponse = {
      mode: 'guide',
      steps: [{ text: 'Step', point: { x: 10, y: 10, display: 99 } }],
    };
    const model = buildRenderModel(guidance, [PRIMARY, SECONDARY]);
    expect(model.steps[0]).toEqual({ text: 'Step', point: { x: 10, y: 10, display: 0 }, available: true });
  });

  it('is unavailable (no point) when there are no known displays at all', () => {
    const guidance: GuidanceResponse = { mode: 'guide', steps: [{ text: 'Step', point: { x: 10, y: 10 } }] };
    const model = buildRenderModel(guidance, []);
    expect(model.steps).toEqual([{ text: 'Step', available: false }]);
  });

  it('caps a 13-step guidance response at MAX_GUIDED_STEPS (12)', () => {
    const guidance: GuidanceResponse = {
      mode: 'guide',
      steps: Array.from({ length: 13 }, (_, i) => ({ text: 'step ' + String(i) })),
    };
    const model = buildRenderModel(guidance, [PRIMARY]);
    expect(model.steps).toHaveLength(MAX_GUIDED_STEPS);
    expect(model.steps[0]?.text).toBe('step 0');
    expect(model.steps[MAX_GUIDED_STEPS - 1]?.text).toBe('step 11');
  });

  it('preserves assist mode', () => {
    const guidance: GuidanceResponse = { mode: 'assist', steps: [] };
    expect(buildRenderModel(guidance, [PRIMARY]).mode).toBe('assist');
  });
});
