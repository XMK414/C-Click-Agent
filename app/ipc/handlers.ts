// app/ipc/handlers.ts — main-process IPC handlers + the proposal registry wiring.
//
// SLICE 1.2/1.7/2.3. Every inbound payload is validated with app/ipc/schemas.ts
// BEFORE use. The proposal registry is the security core of the confirm flow:
//   - main mints a proposalId (uuid) and stores the ProposedAction in a Map
//   - the renderer can only send { proposalId, approved }
//   - on approve, main looks up the stored action and executes via PlatformBridge
//   - on deny/timeout, the entry is dropped; the renderer never supplies the action
//
// proposeAction()/handleDecision() are pure and Electron-free — fully unit
// testable. registerAutomationHandlers() is the thin ipcMain wiring around
// them and is exercised via the demo/e2e lane, not vitest (same split main.ts
// already uses for its own ipcMain.handle registrations).

import type { WebContents } from 'electron';
import { IPC_CHANNELS } from './channels.js';
import { automationDecisionSchema, safeParse } from './schemas.js';
import { createProposalRegistry, type ProposalOrigin, type ProposalRegistry } from './proposal-registry.js';
import { executeAction, type ExecuteActionOptions } from './execute-action.js';
import type { PlatformBridge } from '../platform/index.js';
import type { ProposedAction } from '../models/types.js';

export interface ProposeResult {
  proposalId: string;
}

/**
 * Mint a proposal for an action from any origin. Never executes anything —
 * the caller is expected to send the resulting proposalId + action + origin
 * to the panel as AUTOMATION_PROPOSAL. Returns null if the origin is
 * rate-limited (silently dropped — an injected flood can't spam the user).
 */
export function proposeAction(
  registry: ProposalRegistry,
  action: ProposedAction,
  origin: ProposalOrigin,
): ProposeResult | null {
  const proposalId = registry.mint(action, origin);
  if (!proposalId) return null;
  return { proposalId };
}

export type DecisionOutcome =
  | { status: 'executed' }
  | { status: 'denied' }
  | { status: 'rejected'; reason: 'invalid_payload' | 'unknown_or_expired' | 'execution_failed' };

/**
 * Handle a renderer's AUTOMATION_DECISION. `rawDecision` is untrusted and
 * validated here — `automationDecisionSchema` only declares `{proposalId,
 * approved}`, so zod strips any other field (e.g. an injected `action`)
 * before this function ever sees it. The ONLY action ever executed is the one
 * `registry.consume()` returns — never anything from `rawDecision`.
 */
export function handleDecision(
  registry: ProposalRegistry,
  bridge: PlatformBridge,
  rawDecision: unknown,
  executeOptions: ExecuteActionOptions = {},
): DecisionOutcome {
  const parsed = safeParse(automationDecisionSchema, rawDecision);
  if (!parsed.ok) return { status: 'rejected', reason: 'invalid_payload' };

  const { proposalId, approved } = parsed.value;
  // Consume unconditionally — a denial also retires the entry so it can never be resubmitted.
  const action = registry.consume(proposalId);
  if (!action) return { status: 'rejected', reason: 'unknown_or_expired' };
  if (!approved) return { status: 'denied' };

  try {
    executeAction(bridge, action, executeOptions);
    return { status: 'executed' };
  } catch {
    return { status: 'rejected', reason: 'execution_failed' };
  }
}

/** Minimal shape we need from Electron's ipcMain — decoupled from its exact
 * (chainable, `this`-returning) type so this stays trivially testable. */
export interface MinimalIpcMain {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

export interface AutomationHandlersDeps {
  ipcMain: MinimalIpcMain;
  registry: ProposalRegistry;
  bridge: PlatformBridge;
  panelWebContents: () => WebContents | null;
  executeOptions?: ExecuteActionOptions;
}

/** Wires the real ipcMain.on(AUTOMATION_DECISION, ...) listener. Call once from main.ts. */
export function registerAutomationHandlers(deps: AutomationHandlersDeps): void {
  deps.ipcMain.on(IPC_CHANNELS.AUTOMATION_DECISION, (_event, raw: unknown) => {
    const outcome = handleDecision(deps.registry, deps.bridge, raw, deps.executeOptions);
    deps.panelWebContents()?.send(IPC_CHANNELS.AUTOMATION_RESULT, outcome);
  });
}

/**
 * Mints a proposal and sends the RAW {proposalId, action, origin} shape to the
 * panel (matching automationProposalSchema — the panel validates it again on
 * arrival and builds its own display model via confirm-view.ts, the same
 * "renderer treats it as untrusted" pattern used for guidance/gate data).
 * Origin-agnostic — model/task/mcp all go through this same path.
 */
export function sendProposal(
  registry: ProposalRegistry,
  panelWebContents: WebContents,
  action: ProposedAction,
  origin: ProposalOrigin,
): ProposeResult | null {
  const proposed = proposeAction(registry, action, origin);
  if (!proposed) return null;
  panelWebContents.send(IPC_CHANNELS.AUTOMATION_PROPOSAL, { proposalId: proposed.proposalId, action, origin });
  return proposed;
}

export { createProposalRegistry };
