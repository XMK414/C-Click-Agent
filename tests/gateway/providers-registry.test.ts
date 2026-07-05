// tests/gateway/providers-registry.test.ts

import { describe, it, expect } from 'vitest';
import {
  resolveProvider,
  requiredGates,
  UnknownProviderError,
} from '../../gateway/providers/registry.js';

describe('resolveProvider', () => {
  it('resolves a known provider', () => {
    expect(resolveProvider('openrouter').name).toBe('OpenRouter');
  });

  it('throws a typed error for an unknown provider', () => {
    expect(() => resolveProvider('nope')).toThrow(UnknownProviderError);
  });
});

describe('requiredGates — aggregator rule (security-load-bearing)', () => {
  it('direct OpenAI requires only the OpenAI gate', () => {
    expect(requiredGates('openai', 'gpt-4o').sort()).toEqual(['openai']);
  });

  it('OpenAI model VIA OpenRouter requires BOTH gates', () => {
    // Without this, the OpenAI gate is bypassable by routing through OpenRouter.
    expect(requiredGates('openrouter', 'openai/gpt-4o').sort()).toEqual(['openai', 'openrouter']);
  });

  it('a non-OpenAI model via OpenRouter requires only OpenRouter', () => {
    expect(requiredGates('openrouter', 'meta-llama/llama-3-70b').sort()).toEqual(['openrouter']);
  });

  it('is case-insensitive on the vendor prefix', () => {
    expect(requiredGates('openrouter', 'OpenAI/gpt-4o').sort()).toEqual(['openai', 'openrouter']);
  });
});
