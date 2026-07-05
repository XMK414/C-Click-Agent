// app/panel/confirm-view.ts — pure, no DOM. Slice 2.3.
//
// Builds the confirmation render model: a CONCRETE, human-readable summary of
// exactly what will happen if approved — never a vague label. This is the
// prompt-injection backstop for the confirm flow: even an action an injected
// prompt smuggled in is still shown verbatim, so the user consents (or
// doesn't) to the real thing, not a euphemism for it. Downstream rendering is
// `textContent` only.

import type { ProposedAction } from '../models/types.js';
import type { ProposalOrigin } from '../ipc/proposal-registry.js';

export interface ConfirmView {
  proposalId: string;
  origin: ProposalOrigin;
  /** Concrete action summary, e.g. "Press Ctrl+Shift+Esc", "Click at (120, 340)". */
  summary: string;
  /** The origin's own description of why — shown verbatim, still textContent downstream. */
  description: string;
}

function summarizeAction(action: ProposedAction): string {
  switch (action.actionType) {
    case 'keys':
      return 'Press ' + (action.keys ?? []).join('+');
    case 'click': {
      const kind = action.clickType && action.clickType !== 'left' ? action.clickType + '-click' : 'Click';
      const x = action.point?.x ?? '?';
      const y = action.point?.y ?? '?';
      return kind + ' at (' + String(x) + ', ' + String(y) + ')';
    }
    case 'focus':
      return 'Focus window "' + (action.targetWindowTitle ?? '') + '"';
    default: {
      const exhaustive: never = action.actionType;
      return 'Unknown action: ' + String(exhaustive);
    }
  }
}

export function toConfirmView(proposalId: string, origin: ProposalOrigin, action: ProposedAction): ConfirmView {
  return {
    proposalId,
    origin,
    summary: summarizeAction(action),
    description: action.description,
  };
}
