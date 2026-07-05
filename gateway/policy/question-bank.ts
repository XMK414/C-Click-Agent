// gateway/policy/question-bank.ts
//
// Thin helpers over the REAL ToS gate content in provider-tos-content.ts.
// tos-manifest.ts is authoritative for WHICH ToS version is currently live; this
// module builds a QuestionPack stamped with that live version, and provides the
// crypto-random picker used to rotate/reshuffle quiz attempts.

import { randomInt } from 'node:crypto';
import type { ManifestEntry, QuestionPack } from './critical-tos-gate.js';
import { PROVIDER_GATE_CONTENT } from './provider-tos-content.js';

/** Build the current pack for a provider, stamped with the live manifest version. */
export function buildQuestionPack(entry: ManifestEntry): QuestionPack {
  return {
    provider: entry.provider,
    tosVersion: entry.tosVersion,
    questionsVersion: entry.questionsVersion,
    questions: PROVIDER_GATE_CONTENT[entry.provider]?.pack.questions ?? [],
  };
}

/**
 * Cryptographically-random pick of `take` distinct indices from `[0, poolSize)`.
 * Used as the `pick` argument to `selectQuestions()` so retakes rotate/reshuffle.
 */
export function randomPick(poolSize: number, take: number): number[] {
  const pool = Array.from({ length: poolSize }, (_, i) => i);
  const picked: number[] = [];
  const want = Math.min(take, poolSize);
  for (let i = 0; i < want; i += 1) {
    const j = randomInt(pool.length);
    picked.push(pool[j]!);
    pool.splice(j, 1);
  }
  return picked;
}
