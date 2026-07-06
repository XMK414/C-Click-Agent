// app/ipc/kill-switch.ts
//
// The kill switch (plan §12). A single source of truth for "injection is halted" that
// BOTH the action executor (execute-action.ts, slice 2.3) and the native bridge
// (windows.ts) consult before any OS-affecting operation. Belt-and-suspenders: two
// independent layers check the same flag, so a bug in one still can't let input through
// while the switch is engaged.
//
// The global hotkey handler in main (Ctrl+Alt+Backspace) calls halt(); the tray/UI can
// resume(). Pure, synchronous, Electron-free, and fully testable.

export type KillSwitchListener = (halted: boolean) => void;

export interface KillSwitch {
  isHalted(): boolean;
  /** Engage: stop all automation. Idempotent. Notifies listeners on transition. */
  halt(reason?: string): void;
  /** Disengage: allow automation again. Idempotent. */
  resume(): void;
  /** The reason the switch was last engaged, if any. */
  lastReason(): string | null;
  /** Subscribe to state transitions; returns an unsubscribe fn. */
  subscribe(fn: KillSwitchListener): () => void;
}

export function createKillSwitch(initiallyHalted = false): KillSwitch {
  let halted = initiallyHalted;
  let reason: string | null = null;
  const listeners = new Set<KillSwitchListener>();

  const emit = (): void => {
    for (const fn of listeners) fn(halted);
  };

  return {
    isHalted: () => halted,
    halt(r?: string): void {
      reason = r ?? 'kill-switch engaged';
      if (!halted) {
        halted = true;
        emit();
      }
    },
    resume(): void {
      if (halted) {
        halted = false;
        reason = null;
        emit();
      }
    },
    lastReason: () => reason,
    subscribe(fn: KillSwitchListener): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * The process-wide kill switch instance. main wires the global hotkey to
 * `killSwitch.halt()`, passes `() => killSwitch.isHalted()` into the platform bridge
 * deps, and execute-action checks `killSwitch.isHalted()` before executing a proposal.
 */
export const killSwitch = createKillSwitch();
