// tests/panel/gate-view.test.ts

import { describe, it, expect } from 'vitest';
import { toQuizView, toResultView, type RedactedGateQuestion } from '../../app/panel/gate-view.js';

const REDACTED_QUESTIONS: RedactedGateQuestion[] = [
  { id: 'q1', topic: 'topic-1', prompt: 'Prompt one?', options: ['a', 'b'] },
  { id: 'q2', topic: 'topic-2', prompt: 'Prompt two?', options: ['c', 'd'] },
];

describe('toQuizView', () => {
  it('carries the warning, detailsUrl, and questions through', () => {
    const view = toQuizView('be careful', REDACTED_QUESTIONS, 'https://example.test/breakdown');
    expect(view.warning).toBe('be careful');
    expect(view.detailsUrl).toBe('https://example.test/breakdown');
    expect(view.questions).toHaveLength(2);
  });

  it('never contains correctIndex, even if a rogue upstream object smuggles one in', () => {
    const rogue = [
      { id: 'q1', topic: 't', prompt: 'p', options: ['a'], correctIndex: 0 },
    ] as unknown as RedactedGateQuestion[];
    const view = toQuizView('w', rogue);
    expect(JSON.stringify(view)).not.toContain('correctIndex');
  });

  it('defaults detailsUrl to an empty string when omitted', () => {
    const view = toQuizView('w', REDACTED_QUESTIONS);
    expect(view.detailsUrl).toBe('');
  });
});

describe('toResultView', () => {
  it('maps a passing result to the unlocked view', () => {
    expect(toResultView({ unlocked: true })).toEqual({ kind: 'unlocked' });
  });

  it('maps a failing result to missedTopics + a retake affordance, never answer text', () => {
    const view = toResultView({ unlocked: false, missedTopics: ['topic-1'] });
    expect(view).toEqual({ kind: 'failed', missedTopics: ['topic-1'], canRetake: true });
    expect(JSON.stringify(view)).not.toContain('correctIndex');
  });

  it('defaults missedTopics to an empty array when absent', () => {
    const view = toResultView({ unlocked: false });
    expect(view).toEqual({ kind: 'failed', missedTopics: [], canRetake: true });
  });
});
