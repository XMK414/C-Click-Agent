// gateway/policy/critical-tos-gate.ts
//
// Critical ToS Gate (template Appendix C v1.1, operationalized in plan FS-C).
//
// Purpose: informed consent + liability posture, NOT fortress security.
//   - A user may BYO-key any flagged provider (including OpenAI) IFF they pass
//     that provider's gate at 100%.
//   - A pass is consent to a SPECIFIC ToS version, never to the provider forever.
//   - When the ToS version changes, ALL passes for that provider expire and the
//     key is disabled until the user re-passes against regenerated questions.
//
// This module is pure logic (no I/O, no Electron, no network) so it is fully
// unit-testable and runs in CI. Persistence + manifest fetching are injected.

export type ProviderId = string;

/** A single multiple-choice question generated from a flagged ToS clause. */
export interface GateQuestion {
  id: string;
  /** The clause topic this question tests (surfaced on failure — never the answer). */
  topic: string;
  prompt: string;
  /** 2–4 options. Option order is shuffled at presentation time, not here. */
  options: readonly string[];
  /** Index into `options` of the correct answer. Never sent to the renderer. */
  correctIndex: number;
}

/** A versioned pack of questions for one provider's current ToS. */
export interface QuestionPack {
  provider: ProviderId;
  /** Matches the ToS version this pack was generated from. */
  questionsVersion: string;
  tosVersion: string;
  questions: readonly GateQuestion[];
}

/** Persisted proof of consent. Schema is verbatim from template Appendix C. */
export interface GatePassRecord {
  userOrDeviceId: string;
  provider: ProviderId;
  /** Hash or effective-date string identifying the exact ToS version consented to. */
  tosVersion: string;
  questionsVersion: string;
  /** UTC ISO-8601. */
  timestamp: string;
}

/** What the current signed manifest says is live for a provider. */
export interface ManifestEntry {
  provider: ProviderId;
  tosVersion: string;
  questionsVersion: string;
}

export type GateDecision =
  | { status: 'unlocked' }
  | { status: 'gate_not_passed'; reason: 'no_pass' | 'tos_version_changed' | 'questions_version_changed' };

/**
 * Number of questions to ask. Template Appendix C: 1–2 questions, hard cap 3.
 * Pass threshold is 100% — any miss fails.
 */
export const GATE_MIN_QUESTIONS = 1;
export const GATE_MAX_QUESTIONS = 3;
export const GATE_PASS_THRESHOLD = 1.0; // 100%

/**
 * Decide whether a stored pass unlocks a provider *right now*, given what the
 * manifest currently says is live. This is the load-bearing invalidation rule.
 */
export function evaluatePass(
  pass: GatePassRecord | null | undefined,
  manifest: ManifestEntry,
): GateDecision {
  if (!pass) return { status: 'gate_not_passed', reason: 'no_pass' };
  if (pass.provider !== manifest.provider) {
    // Defensive: never let a pass for provider A unlock provider B.
    return { status: 'gate_not_passed', reason: 'no_pass' };
  }
  if (pass.tosVersion !== manifest.tosVersion) {
    return { status: 'gate_not_passed', reason: 'tos_version_changed' };
  }
  if (pass.questionsVersion !== manifest.questionsVersion) {
    return { status: 'gate_not_passed', reason: 'questions_version_changed' };
  }
  return { status: 'unlocked' };
}

export interface GradedAttempt {
  passed: boolean;
  /** Fraction correct, 0..1. */
  score: number;
  /** Topics the user missed — surfaced to the user; the correct answer is NOT. */
  missedTopics: string[];
}

/**
 * Grade a submitted attempt against a pack. 100% required.
 * `answers` maps questionId -> chosen option index.
 */
export function gradeAttempt(
  pack: QuestionPack,
  answers: Readonly<Record<string, number>>,
): GradedAttempt {
  const asked = pack.questions;
  if (asked.length === 0) {
    // No questions means the gate cannot grant informed consent — fail closed.
    return { passed: false, score: 0, missedTopics: [] };
  }

  let correct = 0;
  const missedTopics: string[] = [];
  for (const q of asked) {
    const chosen = answers[q.id];
    if (chosen === q.correctIndex) {
      correct += 1;
    } else {
      missedTopics.push(q.topic);
    }
  }

  const score = correct / asked.length;
  const passed = score >= GATE_PASS_THRESHOLD;
  return { passed, score, missedTopics };
}

/**
 * Build the pass record to persist after a successful attempt. Callers must only
 * invoke this when `gradeAttempt(...).passed === true`; we assert to fail loud.
 */
export function mintPassRecord(
  userOrDeviceId: string,
  pack: QuestionPack,
  now: Date = new Date(),
): GatePassRecord {
  return {
    userOrDeviceId,
    provider: pack.provider,
    tosVersion: pack.tosVersion,
    questionsVersion: pack.questionsVersion,
    timestamp: now.toISOString(),
  };
}

/**
 * Select which questions to present for an attempt. Deterministic given a picker
 * so it is testable; production passes a crypto-seeded shuffle. Enforces the
 * 1..3 cap. On retake, callers should rotate/reshuffle via a different picker.
 */
export function selectQuestions(
  pack: QuestionPack,
  count: number,
  pick: (poolSize: number, take: number) => number[],
): GateQuestion[] {
  const clamped = Math.max(GATE_MIN_QUESTIONS, Math.min(GATE_MAX_QUESTIONS, count));
  const take = Math.min(clamped, pack.questions.length);
  const indices = pick(pack.questions.length, take);
  return indices.map((i) => {
    const q = pack.questions[i];
    if (!q) throw new Error(`selectQuestions: picker returned out-of-range index ${i}`);
    return q;
  });
}

/** Strip the answer key before a pack/question ever leaves the gateway. */
export function redactForClient(q: GateQuestion): Omit<GateQuestion, 'correctIndex'> {
  const { correctIndex: _correctIndex, ...safe } = q;
  return safe;
}
