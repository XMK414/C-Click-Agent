// tests/ipc/handlers.test.ts

import { describe, it, expect, vi } from 'vitest';
import { createMockBridge } from '../../app/platform/mock.js';
import { createProposalRegistry } from '../../app/ipc/proposal-registry.js';
import { handleDecision, proposeAction, registerAutomationHandlers, sendProposal } from '../../app/ipc/handlers.js';
import type { ProposedAction } from '../../app/models/types.js';

const focusAction: ProposedAction = {
  actionType: 'focus',
  targetWindowTitle: 'Settings',
  description: 'Bring Settings to the foreground',
};

describe('proposeAction', () => {
  it('mints a proposal and returns its id', () => {
    const registry = createProposalRegistry();
    const result = proposeAction(registry, focusAction, 'model');
    expect(result).toEqual({ proposalId: expect.any(String) });
  });

  it('returns null when the origin is rate-limited', () => {
    const registry = createProposalRegistry({ rateLimit: { windowMs: 10_000, maxPerOrigin: 1 } });
    expect(proposeAction(registry, focusAction, 'model')).not.toBeNull();
    expect(proposeAction(registry, focusAction, 'model')).toBeNull();
  });
});

describe('handleDecision', () => {
  it('no execution without a minted proposal: an unknown proposalId never reaches the bridge', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const outcome = handleDecision(registry, bridge, {
      proposalId: '00000000-0000-0000-0000-000000000000',
      approved: true,
    });
    expect(outcome).toEqual({ status: 'rejected', reason: 'unknown_or_expired' });
    expect(bridge.calls).toHaveLength(0);
  });

  it('rejects a malformed payload before ever touching the registry', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const outcome = handleDecision(registry, bridge, { nope: true });
    expect(outcome).toEqual({ status: 'rejected', reason: 'invalid_payload' });
    expect(bridge.calls).toHaveLength(0);
  });

  it('approve executes via the bridge exactly once (consume-once replay guard)', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model')!;

    const first = handleDecision(registry, bridge, { proposalId, approved: true });
    expect(first).toEqual({ status: 'executed' });
    expect(bridge.calls).toHaveLength(1);

    const second = handleDecision(registry, bridge, { proposalId, approved: true });
    expect(second).toEqual({ status: 'rejected', reason: 'unknown_or_expired' });
    expect(bridge.calls).toHaveLength(1); // still just once
  });

  it('deny never calls the bridge and retires the entry', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model')!;

    expect(handleDecision(registry, bridge, { proposalId, approved: false })).toEqual({ status: 'denied' });
    expect(bridge.calls).toHaveLength(0);
    // A late approval attempt on the same id can never resurrect it.
    expect(handleDecision(registry, bridge, { proposalId, approved: true })).toEqual({
      status: 'rejected',
      reason: 'unknown_or_expired',
    });
    expect(bridge.calls).toHaveLength(0);
  });

  it('expiry: once a proposal is expired (per the registry), approving it behaves exactly like an unknown id', () => {
    // handleDecision has no `now` override — it always consumes at the real
    // clock, so expiry-over-time is exercised directly against the registry
    // here (see tests/ipc/proposal-registry.test.ts for the TTL math itself);
    // this asserts handleDecision treats "already consumed/expired" uniformly,
    // never distinguishing "expired" from "never existed" to the caller.
    const registry = createProposalRegistry({ ttlMs: 1000 });
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model', 0)!;
    expect(registry.consume(proposalId, 5000)).toBeNull(); // pre-expire it directly
    const outcome = handleDecision(registry, bridge, { proposalId, approved: true });
    expect(outcome).toEqual({ status: 'rejected', reason: 'unknown_or_expired' });
    expect(bridge.calls).toHaveLength(0);
  });

  it('renderer can only approve/deny: an injected action field in the decision payload is ignored — the STORED action executes', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model')!;

    const evilPayload = {
      proposalId,
      approved: true,
      action: { actionType: 'keys', keys: ['CTRL', 'ALT', 'DELETE'], description: 'evil' },
    };
    const outcome = handleDecision(registry, bridge, evilPayload);
    expect(outcome).toEqual({ status: 'executed' });
    // The executed call is focusWindow("Settings") — the STORED action — never sendKeys.
    expect(bridge.calls).toEqual([{ fn: 'focusWindow', args: ['Settings'], at: expect.any(Number) }]);
  });

  it('defense-in-depth re-validation failure surfaces as execution_failed, not a thrown exception', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const badAction = { actionType: 'keys', keys: ['NOT-A-REAL-TOKEN'], description: 'x' } as unknown as ProposedAction;
    const proposalId = registry.mint(badAction, 'model')!;
    const outcome = handleDecision(registry, bridge, { proposalId, approved: true });
    expect(outcome).toEqual({ status: 'rejected', reason: 'execution_failed' });
    expect(bridge.calls).toHaveLength(0);
  });

  it.each(['model', 'task', 'mcp'] as const)('origin-agnostic: %s proposals go through the identical round trip', (origin) => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, origin)!;
    expect(handleDecision(registry, bridge, { proposalId, approved: true })).toEqual({ status: 'executed' });
  });
});

describe('sendProposal', () => {
  it('mints a proposal and sends the raw {proposalId, action, origin} shape to the panel', () => {
    const registry = createProposalRegistry();
    const send = vi.fn();
    const result = sendProposal(registry, { send } as never, focusAction, 'task');
    expect(result).toEqual({ proposalId: expect.any(String) });
    expect(send).toHaveBeenCalledWith('automation-proposal', {
      proposalId: result!.proposalId,
      action: focusAction,
      origin: 'task',
    });
  });

  it('returns null and never sends anything when the origin is rate-limited', () => {
    const registry = createProposalRegistry({ rateLimit: { windowMs: 10_000, maxPerOrigin: 1 } });
    const send = vi.fn();
    sendProposal(registry, { send } as never, focusAction, 'task');
    const result = sendProposal(registry, { send } as never, focusAction, 'task');
    expect(result).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('registerAutomationHandlers', () => {
  it('wires ipcMain.on and, on a decision, sends AUTOMATION_RESULT with the outcome', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model')!;

    let capturedListener: ((event: unknown, raw: unknown) => void) | undefined;
    const ipcMain = {
      on: vi.fn((_channel: string, listener: (event: unknown, raw: unknown) => void) => {
        capturedListener = listener;
      }),
    };
    const send = vi.fn();

    registerAutomationHandlers({
      ipcMain,
      registry,
      bridge,
      panelWebContents: () => ({ send }) as never,
    });

    expect(ipcMain.on).toHaveBeenCalledWith('automation-decision', expect.any(Function));
    capturedListener!({}, { proposalId, approved: true });

    expect(bridge.calls).toEqual([{ fn: 'focusWindow', args: ['Settings'], at: expect.any(Number) }]);
    expect(send).toHaveBeenCalledWith('automation-result', { status: 'executed' });
  });

  it('does not throw when the panel window is unavailable', () => {
    const registry = createProposalRegistry();
    const bridge = createMockBridge();
    const proposalId = registry.mint(focusAction, 'model')!;

    let capturedListener: ((event: unknown, raw: unknown) => void) | undefined;
    const ipcMain = {
      on: vi.fn((_channel: string, listener: (event: unknown, raw: unknown) => void) => {
        capturedListener = listener;
      }),
    };

    registerAutomationHandlers({ ipcMain, registry, bridge, panelWebContents: () => null });
    expect(() => capturedListener!({}, { proposalId, approved: true })).not.toThrow();
  });
});
