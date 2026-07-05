// gateway/providers/registry.ts
//
// Provider registry + resolution + the aggregator rule (plan §6, FS-C).
//
// The aggregator rule is security-load-bearing: OpenAI models are reachable
// THROUGH OpenRouter, so selecting an OpenAI model via OpenRouter must require
// OpenAI's own gate pass — not just OpenRouter's. Without this, the OpenAI gate
// is trivially bypassable.
//
// Pure config + logic. No network here; the actual upstream fetch lives in the
// per-provider modules (openrouter.ts, oauth.ts).

import type { ProviderId } from '../policy/critical-tos-gate.js';

export type AuthStyle = 'bearer' | 'oauth';

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  authStyle: AuthStyle;
  /** If true, a valid gate pass is required before any upstream call. */
  criticalTos: boolean;
  /**
   * Aggregators only: map a requested model string to the flagged upstream
   * provider it actually routes to, or null if the model is not a flagged
   * upstream. Non-aggregators omit this.
   */
  flaggedUpstreamFor?: (model: string) => ProviderId | null;
}

/**
 * Registry. ToS/Gate *activation* for a provider is blocked until its Provider
 * Matrix columns are filled by a TermLens/TOScan scan (plan §4) — but the
 * registry shape itself is stable and testable now.
 */
export const PROVIDERS: Readonly<Record<ProviderId, ProviderConfig>> = Object.freeze({
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    authStyle: 'bearer',
    criticalTos: true,
    flaggedUpstreamFor: (model: string): ProviderId | null => {
      // OpenRouter namespaces models as "vendor/model". Any OpenAI-vendored
      // model routes to the OpenAI upstream and inherits OpenAI's gate.
      const vendor = model.split('/')[0]?.toLowerCase();
      if (vendor === 'openai') return 'openai';
      return null;
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (BYO key)',
    baseUrl: 'https://api.openai.com/v1',
    authStyle: 'bearer',
    criticalTos: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (BYO key)',
    baseUrl: 'https://api.anthropic.com/v1',
    authStyle: 'bearer',
    // Pending scan — default to gated (fail safe) until the matrix says otherwise.
    criticalTos: true,
  },
});

export function resolveProvider(id: ProviderId): ProviderConfig {
  const p = PROVIDERS[id];
  if (!p) throw new UnknownProviderError(id);
  return p;
}

export class UnknownProviderError extends Error {
  constructor(public readonly providerId: ProviderId) {
    super(`Unknown provider: ${providerId}`);
    this.name = 'UnknownProviderError';
  }
}

/**
 * Given the selected provider + model, return the full set of provider IDs whose
 * gates must ALL be passed before the call is allowed. For a direct provider that
 * is just itself. For an aggregator routing to a flagged upstream, it is both.
 */
export function requiredGates(providerId: ProviderId, model: string): ProviderId[] {
  const provider = resolveProvider(providerId);
  const gates = new Set<ProviderId>();
  if (provider.criticalTos) gates.add(provider.id);

  const upstreamId = provider.flaggedUpstreamFor?.(model) ?? null;
  if (upstreamId) {
    const upstream = resolveProvider(upstreamId);
    if (upstream.criticalTos) gates.add(upstream.id);
  }
  return [...gates];
}
