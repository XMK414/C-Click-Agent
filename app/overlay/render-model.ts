// app/overlay/render-model.ts — pure, no DOM. Slice 1.4.
//
// Coordinates from a model are untrusted (plan §7): every step point is clamped
// to a known display's bounds before the overlay ever sees it. A point that had
// to be clamped is marked `available: false` so overlay.ts never animates the
// buddy cursor to a coordinate the model merely guessed at.

import type { GuidanceResponse, GuidedStep } from '../models/types.js';
import { MAX_GUIDED_STEPS } from '../models/types.js';

export interface DisplayBounds {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderPoint {
  x: number;
  y: number;
  display: number;
}

export interface RenderStep {
  text: string;
  point?: RenderPoint;
  available: boolean;
}

export interface RenderModel {
  mode: GuidanceResponse['mode'];
  steps: RenderStep[];
}

function resolveDisplay(
  displays: readonly DisplayBounds[],
  requestedId: number | undefined,
): DisplayBounds | undefined {
  if (requestedId !== undefined) {
    return displays.find((d) => d.id === requestedId) ?? displays[0];
  }
  return displays[0];
}

function clampStepPoint(
  point: NonNullable<GuidedStep['point']>,
  displays: readonly DisplayBounds[],
): { point: RenderPoint; available: boolean } | null {
  const display = resolveDisplay(displays, point.display);
  if (!display) return null; // no known displays — nothing safe to clamp against

  const maxX = display.x + display.width - 1;
  const maxY = display.y + display.height - 1;
  const clampedX = Math.min(Math.max(point.x, display.x), maxX);
  const clampedY = Math.min(Math.max(point.y, display.y), maxY);
  const available = clampedX === point.x && clampedY === point.y;
  return { point: { x: clampedX, y: clampedY, display: display.id }, available };
}

/** Build the overlay's render model from a validated GuidanceResponse. */
export function buildRenderModel(guidance: GuidanceResponse, displays: readonly DisplayBounds[]): RenderModel {
  const cappedSteps = guidance.steps.slice(0, MAX_GUIDED_STEPS);
  const steps: RenderStep[] = cappedSteps.map((step): RenderStep => {
    if (!step.point) return { text: step.text, available: false };
    const clamped = clampStepPoint(step.point, displays);
    if (!clamped) return { text: step.text, available: false };
    return { text: step.text, point: clamped.point, available: clamped.available };
  });
  return { mode: guidance.mode, steps };
}
