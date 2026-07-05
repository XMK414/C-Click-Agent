// app/models/types.ts — guidance + proposal contracts (plan FS-A).

import type { ClickType } from '../platform/index.js';
import type { TaskStepPoint } from '../tasks/types.js';

export interface GuidedStep {
  text: string;
  point?: TaskStepPoint;
}

export interface ProposedAction {
  actionType: 'keys' | 'click' | 'focus';
  keys?: string[];
  point?: TaskStepPoint;
  clickType?: ClickType;
  targetWindowTitle?: string;
  description: string; // shown in the confirmation UI
}

export interface GuidanceResponse {
  steps: GuidedStep[]; // cap: 12 (enforced by zod)
  mode: 'guide' | 'assist';
  actions?: ProposedAction[]; // assist mode only; each becomes a proposal
}

/** Max guided steps a model response may contain (plan §7 injection cap). */
export const MAX_GUIDED_STEPS = 12;
