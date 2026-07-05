// tests/gateway/critical-tos-gate.test.ts

import { describe, it, expect } from 'vitest';
import {
  evaluatePass,
  gradeAttempt,
  mintPassRecord,
  selectQuestions,
  redactForClient,
  GATE_MAX_QUESTIONS,
  type GatePassRecord,
  type ManifestEntry,
  type QuestionPack,
  type GateQuestion,
} from '../../gateway/policy/critical-tos-gate.js';

const q = (id: string, topic: string, correctIndex: number): GateQuestion => ({
  id,
  topic,
  prompt: `Prompt ${id}`,
  options: ['a', 'b', 'c'],
  correctIndex,
});

const pack: QuestionPack = {
  provider: 'openai',
  questionsVersion: 'q1',
  tosVersion: 'tos-2026-07-01',
  questions: [q('q-a', 'data-retention', 0), q('q-b', 'training-use', 1), q('q-c', 'liability', 2)],
};

const manifest: ManifestEntry = {
  provider: 'openai',
  tosVersion: 'tos-2026-07-01',
  questionsVersion: 'q1',
};

describe('evaluatePass — unlock + invalidation', () => {
  it('unlocks when pass matches the live manifest exactly', () => {
    const pass = mintPassRecord('device-1', pack);
    expect(evaluatePass(pass, manifest)).toEqual({ status: 'unlocked' });
  });

  it('fails closed with no pass', () => {
    expect(evaluatePass(null, manifest)).toEqual({ status: 'gate_not_passed', reason: 'no_pass' });
  });

  it('LOAD-BEARING: a ToS version bump expires an existing pass immediately', () => {
    const pass = mintPassRecord('device-1', pack);
    const bumped: ManifestEntry = { ...manifest, tosVersion: 'tos-2026-08-15' };
    expect(evaluatePass(pass, bumped)).toEqual({
      status: 'gate_not_passed',
      reason: 'tos_version_changed',
    });
  });

  it('a questions-pack bump also invalidates', () => {
    const pass = mintPassRecord('device-1', pack);
    const bumped: ManifestEntry = { ...manifest, questionsVersion: 'q2' };
    expect(evaluatePass(pass, bumped)).toEqual({
      status: 'gate_not_passed',
      reason: 'questions_version_changed',
    });
  });

  it('never lets a pass for provider A unlock provider B', () => {
    const pass: GatePassRecord = { ...mintPassRecord('device-1', pack), provider: 'anthropic' };
    expect(evaluatePass(pass, manifest)).toEqual({ status: 'gate_not_passed', reason: 'no_pass' });
  });
});

describe('gradeAttempt — 100% threshold', () => {
  it('passes only at a perfect score', () => {
    const perfect = gradeAttempt(pack, { 'q-a': 0, 'q-b': 1, 'q-c': 2 });
    expect(perfect).toEqual({ passed: true, score: 1, missedTopics: [] });
  });

  it('fails on a single miss and surfaces the missed TOPIC (not the answer)', () => {
    const oneWrong = gradeAttempt(pack, { 'q-a': 0, 'q-b': 0, 'q-c': 2 });
    expect(oneWrong.passed).toBe(false);
    expect(oneWrong.score).toBeCloseTo(2 / 3);
    expect(oneWrong.missedTopics).toEqual(['training-use']);
  });

  it('fails closed when the pack has no questions', () => {
    const empty: QuestionPack = { ...pack, questions: [] };
    expect(gradeAttempt(empty, {})).toEqual({ passed: false, score: 0, missedTopics: [] });
  });

  it('treats a missing answer as wrong', () => {
    const missing = gradeAttempt(pack, { 'q-a': 0, 'q-b': 1 });
    expect(missing.passed).toBe(false);
    expect(missing.missedTopics).toEqual(['liability']);
  });
});

describe('selectQuestions — 1..3 cap', () => {
  it('clamps a request above the hard cap', () => {
    const picker = (_pool: number, take: number): number[] => Array.from({ length: take }, (_v, i) => i);
    const picked = selectQuestions(pack, 99, picker);
    expect(picked.length).toBeLessThanOrEqual(GATE_MAX_QUESTIONS);
    expect(picked.length).toBe(3);
  });

  it('never takes more than the pool has', () => {
    const small: QuestionPack = { ...pack, questions: [q('only', 'liability', 0)] };
    const picker = (_pool: number, take: number): number[] => Array.from({ length: take }, (_v, i) => i);
    expect(selectQuestions(small, 3, picker).length).toBe(1);
  });
});

describe('redactForClient', () => {
  it('strips the answer key', () => {
    const safe = redactForClient(q('x', 'liability', 2));
    expect('correctIndex' in safe).toBe(false);
    expect(safe).toMatchObject({ id: 'x', topic: 'liability' });
  });
});
