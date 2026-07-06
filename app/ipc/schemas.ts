// app/ipc/schemas.ts
//
// zod is the source of truth for runtime validation (plan §7). Every IPC payload
// is validated in main; every gateway route validates input and normalizes model
// output through these. The TypeScript interfaces in FS-A are the compile-time
// mirror; these schemas are what actually runs at the trust boundary.

import { z } from 'zod';
import { ALLOWED_KEY_TOKENS } from '../platform/key-tokens.js';
import { MAX_GUIDED_STEPS } from '../models/types.js';

const finiteInt = z.number().int().finite();

export const cursorPosSchema = z.object({
  x: finiteInt,
  y: finiteInt,
  display: finiteInt.optional(),
});

export const clickTypeSchema = z.enum(['left', 'right', 'middle']);
export const captureScopeSchema = z.enum(['active-window', 'full-screen']);

/** Key sequences accept whitelisted tokens only — no raw scancodes from a model. */
export const keySequenceSchema = z
  .array(z.string().refine((t) => ALLOWED_KEY_TOKENS.has(t), { message: 'disallowed key token' }))
  .min(1)
  .max(6);

export const stepPointSchema = z.object({
  x: finiteInt,
  y: finiteInt,
  display: finiteInt.optional(),
});

export const guidedStepSchema = z.object({
  text: z.string().min(1).max(500),
  point: stepPointSchema.optional(),
});

export const guidanceResponseSchema = z.object({
  steps: z.array(guidedStepSchema).max(MAX_GUIDED_STEPS),
  mode: z.enum(['guide', 'assist']),
  actions: z.array(z.lazy(() => proposedActionSchema)).optional(),
});

export const proposedActionSchema = z
  .object({
    actionType: z.enum(['keys', 'click', 'focus']),
    keys: keySequenceSchema.optional(),
    point: stepPointSchema.optional(),
    clickType: clickTypeSchema.optional(),
    targetWindowTitle: z.string().max(256).optional(),
    description: z.string().min(1).max(500),
  })
  .superRefine((a, ctx) => {
    // Structural integrity: the payload must actually carry what its type needs.
    if (a.actionType === 'keys' && (!a.keys || a.keys.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'keys action requires keys' });
    }
    if (a.actionType === 'click' && !a.point) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'click action requires point' });
    }
    if (a.actionType === 'focus' && !a.targetWindowTitle) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'focus action requires targetWindowTitle' });
    }
  });

/**
 * Proposal flow (plan FS-A). The renderer can ONLY send an AutomationDecision
 * referencing a proposalId that main issued — it can never submit a raw action
 * payload. This closes the raw export's AUTOMATION_CONFIRM hole.
 */
export const automationProposalSchema = z.object({
  proposalId: z.string().uuid(),
  action: proposedActionSchema,
  origin: z.enum(['model', 'task', 'mcp']),
});

export const automationDecisionSchema = z.object({
  proposalId: z.string().uuid(),
  approved: z.boolean(),
});

export const screenCaptureRequestSchema = z.object({
  scope: captureScopeSchema,
  consent: z.literal(true), // a capture request without explicit consent is invalid
});

export const commandSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.enum(['voice', 'keyboard', 'system']),
  payload: z.record(z.unknown()),
  timestamp: finiteInt,
});

// --- Gateway HTTP route bodies (plan FS-C). Same principle as IPC: the gateway
// validates every inbound body through zod before it is trusted. ---

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
});

export const chatRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
});

export const visionRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

export const gateSubmitRequestSchema = z.object({
  provider: z.string().min(1),
  answers: z.record(z.string(), z.number().int()),
});

// Inferred types — use these at call sites so compile-time and runtime agree.
export type CursorPosInput = z.infer<typeof cursorPosSchema>;
export type GuidanceResponseInput = z.infer<typeof guidanceResponseSchema>;
export type ProposedActionInput = z.infer<typeof proposedActionSchema>;
export type AutomationProposalInput = z.infer<typeof automationProposalSchema>;
export type AutomationDecisionInput = z.infer<typeof automationDecisionSchema>;
export type CommandInput = z.infer<typeof commandSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type VisionRequestInput = z.infer<typeof visionRequestSchema>;
export type GateSubmitRequestInput = z.infer<typeof gateSubmitRequestSchema>;

/**
 * Validate an inbound IPC payload for a channel. Returns a discriminated result
 * so callers in main never throw on hostile input — they reject and log.
 */
export function safeParse<T>(schema: z.ZodType<T>, data: unknown):
  | { ok: true; value: T }
  | { ok: false; error: string } {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
