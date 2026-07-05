// app/panel/gate-view.ts — pure, no DOM. Slice 1.5.
//
// View-models for the gate quiz UX. The panel is untrusted renderer code, so
// these builders don't just declare the answer key absent at the type level —
// toQuizView() explicitly whitelists fields, so even a compromised/malformed
// upstream payload can't smuggle a `correctIndex` through to the DOM layer.

/** The shape /gate/quiz actually serves — never includes correctIndex. */
export interface RedactedGateQuestion {
  id: string;
  topic: string;
  prompt: string;
  options: readonly string[];
}

export interface QuizView {
  warning: string;
  detailsUrl: string;
  questions: readonly RedactedGateQuestion[];
}

/** Build the quiz render model. `questions` must already be the redacted shape. */
export function toQuizView(
  warning: string,
  questions: readonly RedactedGateQuestion[],
  detailsUrl = '',
): QuizView {
  return {
    warning,
    detailsUrl,
    // Explicit field whitelist — never pass an upstream object through wholesale.
    questions: questions.map((q) => ({ id: q.id, topic: q.topic, prompt: q.prompt, options: q.options })),
  };
}

export interface SubmitResult {
  unlocked: boolean;
  missedTopics?: string[];
}

export type ResultView =
  | { kind: 'unlocked' }
  | { kind: 'failed'; missedTopics: readonly string[]; canRetake: true };

/** Build the result render model. Never surfaces answer text — topics only. */
export function toResultView(result: SubmitResult): ResultView {
  if (result.unlocked) return { kind: 'unlocked' };
  return { kind: 'failed', missedTopics: result.missedTopics ?? [], canRetake: true };
}
