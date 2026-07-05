// app/ipc/execute-action.ts — the SOLE execution entrypoint. Slice 2.3.
//
// Takes an already-CONSUMED ProposedAction (never a proposalId — callers must
// have already round-tripped through proposal-registry.consume()) and calls
// the PlatformBridge. Re-validates the action before acting: key-token
// whitelist (assertKeyTokens) and coordinate clamping (a click point must fall
// within a known display) — defense in depth across the trust boundary
// between mint and execute, even though the proposal schema validated the
// action's shape once already.

import { assertKeyTokens, type PlatformBridge } from '../platform/index.js';
import type { ProposedAction } from '../models/types.js';
import type { DisplayBounds } from '../overlay/render-model.js';

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidActionError';
  }
}

export interface ExecuteActionOptions {
  /** Known display bounds. If provided and non-empty, a click point outside all of them is rejected. */
  displays?: DisplayBounds[];
}

function isWithinAnyDisplay(point: { x: number; y: number }, displays: DisplayBounds[]): boolean {
  return displays.some(
    (d) => point.x >= d.x && point.x < d.x + d.width && point.y >= d.y && point.y < d.y + d.height,
  );
}

/** The only function in this codebase permitted to call PlatformBridge action methods. */
export function executeAction(
  bridge: PlatformBridge,
  action: ProposedAction,
  options: ExecuteActionOptions = {},
): void {
  switch (action.actionType) {
    case 'keys': {
      if (!action.keys || action.keys.length === 0) {
        throw new InvalidActionError('keys action requires a non-empty key sequence');
      }
      assertKeyTokens(action.keys); // throws on any disallowed token
      bridge.sendKeys(action.keys);
      return;
    }
    case 'click': {
      if (!action.point) {
        throw new InvalidActionError('click action requires a point');
      }
      const displays = options.displays ?? [];
      if (displays.length > 0 && !isWithinAnyDisplay(action.point, displays)) {
        throw new InvalidActionError('click point falls outside every known display');
      }
      bridge.moveCursor(action.point);
      bridge.click(action.clickType ?? 'left');
      return;
    }
    case 'focus': {
      if (!action.targetWindowTitle) {
        throw new InvalidActionError('focus action requires targetWindowTitle');
      }
      bridge.focusWindow(action.targetWindowTitle);
      return;
    }
    default: {
      const exhaustive: never = action.actionType;
      throw new InvalidActionError('unknown actionType: ' + String(exhaustive));
    }
  }
}
