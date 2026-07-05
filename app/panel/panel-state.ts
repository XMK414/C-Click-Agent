// app/panel/panel-state.ts — pure, no DOM. Slice 1.5.
//
// Panel state machine, Phase 1 subset of FS-E's table (Listening is voice — P4,
// omitted here). Valid transitions only; anything else is rejected (no-op),
// never silently coerced.
//
//   Collapsed -> Expanded             (hover / summon chord)
//   Expanded  -> Processing           (input submitted)
//   Expanded  -> Collapsed            (mouse leaves before submitting)
//   Processing -> Replying            (agent finishes)
//   Replying  -> Collapsed            (reply done / mouse leaves)

export type PanelState = 'Collapsed' | 'Expanded' | 'Processing' | 'Replying';

const VALID_TRANSITIONS: Readonly<Record<PanelState, readonly PanelState[]>> = Object.freeze({
  Collapsed: ['Expanded'],
  Expanded: ['Processing', 'Collapsed'],
  Processing: ['Replying'],
  Replying: ['Collapsed'],
});

export function canTransition(from: PanelState, to: PanelState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export interface PanelStateMachine {
  readonly state: PanelState;
  /** Applies the transition and returns true, or rejects it (no-op) and returns false. */
  transition(to: PanelState): boolean;
}

export function createPanelStateMachine(initial: PanelState = 'Collapsed'): PanelStateMachine {
  let state = initial;
  return {
    get state(): PanelState {
      return state;
    },
    transition(to: PanelState): boolean {
      if (!canTransition(state, to)) return false;
      state = to;
      return true;
    },
  };
}
