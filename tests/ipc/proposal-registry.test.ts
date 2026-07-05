// tests/ipc/proposal-registry.test.ts
//
// The security core of the confirm flow. 100% coverage required.

import { describe, it, expect } from 'vitest';
import { createProposalRegistry, type ProposalOrigin } from '../../app/ipc/proposal-registry.js';
import type { ProposedAction } from '../../app/models/types.js';

const sampleAction: ProposedAction = {
  actionType: 'focus',
  targetWindowTitle: 'Settings',
  description: 'Bring Settings to the foreground',
};

describe('mint / consume', () => {
  it('mint returns a proposalId; consume returns the exact stored action', () => {
    const registry = createProposalRegistry();
    const proposalId = registry.mint(sampleAction, 'model');
    expect(proposalId).toEqual(expect.any(String));
    expect(registry.consume(proposalId!)).toEqual(sampleAction);
  });

  it('consume on an unknown proposalId returns null', () => {
    const registry = createProposalRegistry();
    expect(registry.consume('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('consume-once: a second consume of the same id returns null (replay guard)', () => {
    const registry = createProposalRegistry();
    const proposalId = registry.mint(sampleAction, 'model')!;
    expect(registry.consume(proposalId)).toEqual(sampleAction);
    expect(registry.consume(proposalId)).toBeNull();
  });

  it('mints distinct ids for repeated proposals', () => {
    const registry = createProposalRegistry();
    const a = registry.mint(sampleAction, 'model');
    const b = registry.mint(sampleAction, 'model');
    expect(a).not.toBe(b);
  });
});

describe('peek', () => {
  it('returns the action + origin without consuming it', () => {
    const registry = createProposalRegistry();
    const proposalId = registry.mint(sampleAction, 'task')!;
    expect(registry.peek(proposalId)).toEqual({ action: sampleAction, origin: 'task' });
    // Still consumable afterward — peek did not remove it.
    expect(registry.consume(proposalId)).toEqual(sampleAction);
  });

  it('returns null for an unknown proposalId', () => {
    const registry = createProposalRegistry();
    expect(registry.peek('nope')).toBeNull();
  });

  it('returns null once the proposal has expired', () => {
    const registry = createProposalRegistry({ ttlMs: 1000 });
    const proposalId = registry.mint(sampleAction, 'model', 0)!;
    expect(registry.peek(proposalId, 500)).not.toBeNull();
    expect(registry.peek(proposalId, 5000)).toBeNull();
  });
});

describe('expiry (TTL)', () => {
  it('consume returns null once past the TTL, even though the entry existed', () => {
    const registry = createProposalRegistry({ ttlMs: 1000 });
    const proposalId = registry.mint(sampleAction, 'model', 0)!;
    expect(registry.consume(proposalId, 5000)).toBeNull();
  });

  it('a consume attempt after expiry still retires the entry (no lingering state)', () => {
    const registry = createProposalRegistry({ ttlMs: 1000 });
    const proposalId = registry.mint(sampleAction, 'model', 0)!;
    registry.consume(proposalId, 5000); // expired -> null
    expect(registry.peek(proposalId, 5000)).toBeNull();
  });

  it('expireStale drops every expired entry and returns the count', () => {
    const registry = createProposalRegistry({ ttlMs: 1000, rateLimit: { windowMs: 1, maxPerOrigin: 100 } });
    const a = registry.mint(sampleAction, 'model', 0)!;
    const b = registry.mint(sampleAction, 'model', 0)!;
    const stillFresh = registry.mint(sampleAction, 'model', 4000)!;
    expect(registry.expireStale(5000)).toBe(2);
    expect(registry.peek(a, 5000)).toBeNull();
    expect(registry.peek(b, 5000)).toBeNull();
    expect(registry.peek(stillFresh, 5000)).not.toBeNull();
  });

  it('expireStale is a no-op when nothing is expired', () => {
    const registry = createProposalRegistry({ ttlMs: 1000 });
    registry.mint(sampleAction, 'model', 0);
    expect(registry.expireStale(500)).toBe(0);
  });
});

describe('per-origin rate limit on mint', () => {
  it('a burst beyond the per-origin cap is throttled (mint returns null)', () => {
    const registry = createProposalRegistry({ rateLimit: { windowMs: 10_000, maxPerOrigin: 3 } });
    const results = Array.from({ length: 5 }, () => registry.mint(sampleAction, 'model', 0));
    expect(results.filter((r) => r !== null)).toHaveLength(3);
    expect(results.filter((r) => r === null)).toHaveLength(2);
  });

  it('the rate limit is per-origin — a flood on one origin does not throttle another', () => {
    const registry = createProposalRegistry({ rateLimit: { windowMs: 10_000, maxPerOrigin: 1 } });
    expect(registry.mint(sampleAction, 'model', 0)).not.toBeNull();
    expect(registry.mint(sampleAction, 'model', 0)).toBeNull(); // model is now capped
    expect(registry.mint(sampleAction, 'task', 0)).not.toBeNull(); // task is unaffected
  });

  it('the rate limit window slides — capacity frees up after windowMs passes', () => {
    const registry = createProposalRegistry({ rateLimit: { windowMs: 1000, maxPerOrigin: 1 } });
    expect(registry.mint(sampleAction, 'model', 0)).not.toBeNull();
    expect(registry.mint(sampleAction, 'model', 500)).toBeNull();
    expect(registry.mint(sampleAction, 'model', 1500)).not.toBeNull();
  });
});

describe('origin-agnostic', () => {
  it.each<ProposalOrigin>(['model', 'task', 'mcp'])('the mint/consume round-trip is identical for origin=%s', (origin) => {
    const registry = createProposalRegistry();
    const proposalId = registry.mint(sampleAction, origin)!;
    expect(registry.peek(proposalId)?.origin).toBe(origin);
    expect(registry.consume(proposalId)).toEqual(sampleAction);
  });
});
