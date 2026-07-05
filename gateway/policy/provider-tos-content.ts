// gateway/policy/provider-tos-content.ts
//
// REAL ToS gate content for the three launch providers, produced from a ToS scan
// on 2026-07-04 (sources cited in specs/tos-scan-report.md). This replaces the
// FIXTURE_ placeholder that used to live in question-bank.ts.
//
// ⚠ BEFORE PRODUCTION: this gates informed consent, so it needs ONE human/legal
// sanity-check pass. It is accurate to the terms as published on the scan date, but
// a person should confirm the flagged clauses and question wording before go-live.
// ToS change — the manifest/invalidation system handles that; when a provider's
// terms change, bump its tosVersion + questionsVersion and re-scan.
//
// NOTE ON tosVersion: these use the terms' effective/verified date. The production
// TermLens/TOScan crawler should additionally hash the fetched ToS document and use
// that hash so any wording change (not just a dated re-issue) invalidates passes.

import type { GateQuestion, QuestionPack } from './critical-tos-gate.js';

/** What /gate/quiz serves before the questions: the warning + a link to the breakdown. */
export interface ProviderGateContent {
  /** Severity the scan assigned. Informs how loud the warning is. */
  severity: 'high' | 'moderate' | 'low';
  /** Shown BEFORE the quiz (paraphrased, not reproduced from the ToS). */
  warning: string;
  /** Link to the full flagged-clause breakdown (TermLens/TOScan output). */
  breakdownUrl: string;
  pack: QuestionPack;
}

const q = (
  id: string,
  topic: string,
  prompt: string,
  options: string[],
  correctIndex: number,
): GateQuestion => ({ id, topic, prompt, options, correctIndex });

export const PROVIDER_GATE_CONTENT: Readonly<Record<string, ProviderGateContent>> = Object.freeze({
  // ── OpenRouter ─────────────────────────────────────────────────────────────
  // Severity HIGH: it's an aggregator (two administrative boundaries), and opting
  // into logging grants broad commercial-use rights over your inputs/outputs.
  openrouter: {
    severity: 'high',
    warning:
      'OpenRouter is an aggregator: your prompt is forwarded to the downstream ' +
      'provider you pick, and that provider’s data, training, and retention terms ' +
      'also apply. Prompts are not logged by default, but if you turn logging on, ' +
      'OpenRouter can gain broad, lasting rights to use your inputs and outputs.',
    breakdownUrl: 'https://openrouter.ai/terms',
    pack: {
      provider: 'openrouter',
      questionsVersion: 'or-q-2026-07-1',
      tosVersion: 'or-2026-05-06',
      questions: [
        q(
          'or-downstream-terms',
          'aggregator-boundary',
          'You send a request through OpenRouter to a downstream model. Whose data and retention terms apply to that prompt?',
          [
            'Only OpenRouter’s terms',
            'Both OpenRouter’s terms AND the selected downstream provider’s terms',
            'Only your own terms',
            'No terms apply once it leaves your machine',
          ],
          1,
        ),
        q(
          'or-logging-license',
          'opt-in-logging-license',
          'OpenRouter does not log your prompts/completions by default. What can change if you opt into prompt logging?',
          [
            'Nothing changes about how your data may be used',
            'OpenRouter can gain broad, lasting rights to use your inputs and outputs (offered with a usage discount)',
            'Your data is deleted faster than the default',
            'Your data becomes end-to-end encrypted from OpenRouter',
          ],
          1,
        ),
      ],
    },
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  // Severity MODERATE: API data is NOT trained on by default and retention is short,
  // which is good — but mandatory arbitration, a class-action waiver, and business
  // indemnification are worth explicit consent, and ZDR is not self-serve.
  openai: {
    severity: 'moderate',
    warning:
      'On the OpenAI API, your inputs/outputs are not used to train models by ' +
      'default and are retained only briefly for abuse monitoring. But disputes go ' +
      'to binding arbitration with a class-action waiver, business users must ' +
      'indemnify OpenAI, and zero-retention is available only to approved enterprise accounts.',
    breakdownUrl: 'https://openai.com/policies/row-terms-of-use/',
    pack: {
      provider: 'openai',
      questionsVersion: 'oai-q-2026-07-1',
      tosVersion: 'oai-2026-01-01',
      questions: [
        q(
          'oai-training-default',
          'api-training-default',
          'Is the data you send to the OpenAI API used to train OpenAI’s models by default?',
          [
            'Yes, always',
            'No — API/business data is not used for training by default',
            'Yes, unless you pay for enterprise',
            'Only prompts are, not completions',
          ],
          1,
        ),
        q(
          'oai-retention',
          'api-retention',
          'By default, how long may OpenAI retain API inputs/outputs for abuse monitoring?',
          [
            'They are never retained',
            'Up to about 30 days (longer only if legally required); zero-retention is enterprise-only and not self-serve',
            'Exactly 5 years',
            'Indefinitely',
          ],
          1,
        ),
        q(
          'oai-arbitration',
          'dispute-resolution',
          'Under OpenAI’s terms, how are most disputes resolved?',
          [
            'Jury trial in your local court',
            'Binding arbitration with a class-action waiver (opt-out within 30 days of account creation)',
            'A public class-action lawsuit',
            'Mediation that is not binding',
          ],
          1,
        ),
      ],
    },
  },

  // ── Anthropic ──────────────────────────────────────────────────────────────
  // Severity LOW: commercial/API content is excluded from training by default and
  // retention is minimal. The consent-worthy nuances are narrow: some models force
  // a 30-day retention (no ZDR), and safety-classifier results persist even under ZDR.
  anthropic: {
    severity: 'low',
    warning:
      'On the Anthropic API (commercial terms), your content is not used to train ' +
      'models by default and is not retained by default. Note two things: certain ' +
      'models require a mandatory ~30-day retention with no zero-retention option, ' +
      'and safety-classifier results are kept even under a zero-retention agreement.',
    breakdownUrl: 'https://www.anthropic.com/legal/commercial-terms',
    pack: {
      provider: 'anthropic',
      questionsVersion: 'anth-q-2026-07-1',
      tosVersion: 'anth-2026-06-27',
      questions: [
        q(
          'anth-commercial-training',
          'commercial-training-default',
          'Is your Anthropic API (commercial) content used to train Anthropic’s models by default?',
          [
            'Yes, by default',
            'No — commercial/API content is excluded from training by default',
            'Only if you use Claude Pro',
            'Yes, unless you opt out in settings',
          ],
          1,
        ),
        q(
          'anth-model-retention',
          'model-specific-retention',
          'Some Anthropic models (Covered Models) require what, even if you would prefer zero retention?',
          [
            'No retention under any circumstances',
            'A mandatory ~30-day data retention (zero-retention is not available for those models)',
            'A 5-year retention like consumer plans',
            'Training on by default',
          ],
          1,
        ),
      ],
    },
  },
});

/** Manifest entries derived from the packs above — keep the signed manifest in sync. */
export const SCANNED_MANIFEST_ENTRIES = Object.values(PROVIDER_GATE_CONTENT).map((c) => ({
  provider: c.pack.provider,
  tosVersion: c.pack.tosVersion,
  questionsVersion: c.pack.questionsVersion,
}));

/**
 * Gates this content from being quietly treated as production-ready. This is
 * consent-gating content — it must get one human/legal sanity-check pass before
 * go-live. The gateway logs a visible warning on every startup while this is
 * `false`. Flip to `true` (and fill `reviewer`/`date`) only after that pass.
 */
export const GATE_CONTENT_LEGAL_REVIEW: { reviewed: boolean; reviewer: string | null; date: string | null } = {
  reviewed: false,
  reviewer: null,
  date: null,
};
