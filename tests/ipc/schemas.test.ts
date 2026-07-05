// tests/ipc/schemas.test.ts

import { describe, it, expect } from 'vitest';
import {
  cursorPosSchema,
  guidanceResponseSchema,
  proposedActionSchema,
  automationDecisionSchema,
  screenCaptureRequestSchema,
  safeParse,
} from '../../app/ipc/schemas.js';

describe('cursorPosSchema', () => {
  it('accepts integer coords', () => {
    expect(cursorPosSchema.safeParse({ x: 1, y: 2 }).success).toBe(true);
  });
  it('rejects non-finite / non-integer', () => {
    expect(cursorPosSchema.safeParse({ x: 1.5, y: 2 }).success).toBe(false);
    expect(cursorPosSchema.safeParse({ x: Infinity, y: 0 }).success).toBe(false);
  });
});

describe('guidanceResponseSchema', () => {
  it('accepts a valid guide response', () => {
    const r = guidanceResponseSchema.safeParse({
      steps: [{ text: 'Open Settings' }, { text: 'Click Sound', point: { x: 10, y: 10 } }],
      mode: 'guide',
    });
    expect(r.success).toBe(true);
  });

  it('enforces the 12-step cap (injection backstop)', () => {
    const steps = Array.from({ length: 13 }, (_v, i) => ({ text: `step ${i}` }));
    expect(guidanceResponseSchema.safeParse({ steps, mode: 'guide' }).success).toBe(false);
  });

  it('rejects an empty step text', () => {
    expect(guidanceResponseSchema.safeParse({ steps: [{ text: '' }], mode: 'guide' }).success).toBe(false);
  });
});

describe('proposedActionSchema — structural integrity', () => {
  it('accepts a well-formed keys action', () => {
    const r = proposedActionSchema.safeParse({
      actionType: 'keys',
      keys: ['CTRL', 'SHIFT', 'ESC'],
      description: 'Open Task Manager',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a keys action with a disallowed token', () => {
    const r = proposedActionSchema.safeParse({
      actionType: 'keys',
      keys: ['CTRL', 'rm -rf /'],
      description: 'malicious',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a keys action with the keys field omitted entirely', () => {
    // Exercises the structural-integrity branch (keys optional at field level,
    // then required by actionType in superRefine).
    const r = proposedActionSchema.safeParse({ actionType: 'keys', description: 'no keys' });
    expect(r.success).toBe(false);
  });

  it('rejects a click action with no point', () => {
    const r = proposedActionSchema.safeParse({ actionType: 'click', description: 'click' });
    expect(r.success).toBe(false);
  });

  it('rejects a focus action with no target window', () => {
    const r = proposedActionSchema.safeParse({ actionType: 'focus', description: 'focus' });
    expect(r.success).toBe(false);
  });
});

describe('automationDecisionSchema — renderer can only approve/deny', () => {
  it('accepts a decision referencing a uuid proposal', () => {
    const r = automationDecisionSchema.safeParse({
      proposalId: '550e8400-e29b-41d4-a716-446655440000',
      approved: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-uuid proposalId', () => {
    expect(automationDecisionSchema.safeParse({ proposalId: 'abc', approved: true }).success).toBe(false);
  });

  it('has no field through which a raw action payload could ride along', () => {
    const r = automationDecisionSchema.safeParse({
      proposalId: '550e8400-e29b-41d4-a716-446655440000',
      approved: true,
      action: { actionType: 'keys', keys: ['CTRL'], description: 'sneaky' },
    });
    // zod strips unknown keys by default; assert the parsed object omits `action`.
    expect(r.success).toBe(true);
    if (r.success) expect('action' in r.data).toBe(false);
  });
});

describe('screenCaptureRequestSchema — consent required', () => {
  it('requires explicit consent literal true', () => {
    expect(screenCaptureRequestSchema.safeParse({ scope: 'full-screen', consent: true }).success).toBe(true);
    expect(screenCaptureRequestSchema.safeParse({ scope: 'full-screen', consent: false }).success).toBe(false);
    expect(screenCaptureRequestSchema.safeParse({ scope: 'full-screen' }).success).toBe(false);
  });
});

describe('safeParse helper', () => {
  it('returns a discriminated ok result', () => {
    const good = safeParse(cursorPosSchema, { x: 1, y: 2 });
    expect(good.ok).toBe(true);
    const bad = safeParse(cursorPosSchema, { x: 'nope' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('x');
  });
});
