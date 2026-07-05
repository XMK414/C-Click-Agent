// app/ipc/proposal-registry.ts — pure, no DOM, no Electron. Slice 2.3.
//
// THE SECURITY CORE of the confirm flow (plan §6/§7, rule #1: confirmation-
// always). An action from ANY origin (model, task, mcp) never executes
// directly — it is minted here, shown to the user via the panel, and can only
// be executed after the renderer sends back the SAME proposalId with an
// approval. The renderer can never submit a raw action payload; it can only
// approve/deny an id main already issued.
//
// consume() is the replay guard: it returns the stored action exactly once,
// then removes the entry — a second consume (a resubmitted decision, a race,
// a replay attempt) gets null, never the action again.

import { randomUUID } from 'node:crypto';
import type { ProposedAction } from '../models/types.js';

export type ProposalOrigin = 'model' | 'task' | 'mcp';

interface StoredProposal {
  action: ProposedAction;
  origin: ProposalOrigin;
  createdAt: number;
}

export interface PeekedProposal {
  action: ProposedAction;
  origin: ProposalOrigin;
}

export interface RateLimitConfig {
  windowMs: number;
  maxPerOrigin: number;
}

export interface ProposalRegistryOptions {
  /** How long a minted proposal stays valid before consume()/peek() treat it as gone. */
  ttlMs?: number;
  rateLimit?: RateLimitConfig;
}

export interface ProposalRegistry {
  /** Mints a proposal and returns its id, or null if the origin is rate-limited (mint dropped silently — never spams the user). */
  mint(action: ProposedAction, origin: ProposalOrigin, now?: number): string | null;
  /** Returns the stored action exactly once, then removes it. Null if unknown, already consumed, or expired. */
  consume(proposalId: string, now?: number): ProposedAction | null;
  /** Non-consuming lookup for display. Null if unknown or expired. */
  peek(proposalId: string, now?: number): PeekedProposal | null;
  /** Drops every expired entry; returns how many were dropped. */
  expireStale(now?: number): number;
}

const DEFAULT_TTL_MS = 45_000;
const DEFAULT_RATE_LIMIT: RateLimitConfig = { windowMs: 10_000, maxPerOrigin: 5 };

export function createProposalRegistry(options: ProposalRegistryOptions = {}): ProposalRegistry {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;

  const proposals = new Map<string, StoredProposal>();
  const mintTimestamps = new Map<ProposalOrigin, number[]>();

  function isExpired(stored: StoredProposal, now: number): boolean {
    return now - stored.createdAt > ttlMs;
  }

  return {
    mint(action: ProposedAction, origin: ProposalOrigin, now = Date.now()): string | null {
      const recent = (mintTimestamps.get(origin) ?? []).filter((t) => now - t < rateLimit.windowMs);
      if (recent.length >= rateLimit.maxPerOrigin) {
        mintTimestamps.set(origin, recent);
        return null;
      }
      recent.push(now);
      mintTimestamps.set(origin, recent);

      const proposalId = randomUUID();
      proposals.set(proposalId, { action, origin, createdAt: now });
      return proposalId;
    },

    consume(proposalId: string, now = Date.now()): ProposedAction | null {
      const stored = proposals.get(proposalId);
      if (!stored) return null;
      proposals.delete(proposalId); // consume-once, regardless of expiry outcome below
      if (isExpired(stored, now)) return null;
      return stored.action;
    },

    peek(proposalId: string, now = Date.now()): PeekedProposal | null {
      const stored = proposals.get(proposalId);
      if (!stored || isExpired(stored, now)) return null;
      return { action: stored.action, origin: stored.origin };
    },

    expireStale(now = Date.now()): number {
      let dropped = 0;
      for (const [id, stored] of proposals) {
        if (isExpired(stored, now)) {
          proposals.delete(id);
          dropped += 1;
        }
      }
      return dropped;
    },
  };
}
