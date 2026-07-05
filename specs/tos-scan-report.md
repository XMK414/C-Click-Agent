# ToS Scan Report — Launch Providers
*Scan date: 2026-07-04. Produced by fetching each provider's current published terms.
Gate content derived from this lives in `gateway/policy/provider-tos-content.ts`.
This is accurate to the terms as published on the scan date and is **pending one
human/legal sanity-check before go-live** — it gates informed consent, so a person
should confirm the flagged clauses and question wording once.*

## Honest headline: the three don't deserve equal "critical" weight
Your policy is "gate every company with a Critical ToS warning." Part of the scan's
job is deciding whether each *earns* that warning. Based on the current terms:

- **OpenRouter — HIGH.** Genuinely critical. Earns a loud gate.
- **OpenAI — MODERATE.** API data handling is actually good; the consent-worthy bits
  are legal (arbitration/indemnity), not data-training.
- **Anthropic — LOW.** Commercial API terms are the most protective of the three. It
  barely earns a warning; the gate is mild and mostly about model-specific retention.

Keeping a gate on all three is still defensible for consistency + liability posture —
just know the severity differs, and the warnings reflect that.

## OpenRouter — HIGH
Terms verified ~May 2026. `tosVersion: or-2026-05-06`.
- **Aggregator / two administrative boundaries.** Your prompt is forwarded to the
  downstream provider you select, and that provider's training + retention defaults
  apply to the request body. The data terms you're consenting to are the *union* of
  OpenRouter's and the downstream provider's. (This is exactly why our gateway
  aggregator rule exists.)
- **Opt-in logging → broad usage rights.** Prompts/completions are not logged by
  default (zero logging). If you enable logging, OpenRouter can obtain broad, lasting
  rights to use your inputs/outputs (offered in exchange for a ~1% usage discount).
- **No liability for outputs**; you're solely responsible for evaluating outputs and
  adding your own safeguards.
- **Termination** at sole discretion, any/no reason, with or without notice; unused
  credits expire after one year.
- **Binding arbitration + class-action waiver.**
- Sources: openrouter.ai/terms; openrouter.ai/docs (data-collection, provider-logging).

## OpenAI — MODERATE
Terms of Use effective **January 1, 2026**; Business Terms govern API use.
`tosVersion: oai-2026-01-01`.
- **API data is NOT used to train models by default** (since 2023-03-01). Good.
- **Retention: up to ~30 days** for abuse monitoring by default, then deleted unless
  legally required. **Zero Data Retention is enterprise-only and not self-serve.**
- **Mandatory arbitration + class-action waiver** (opt out within 30 days).
- **Business users indemnify OpenAI** for third-party claims arising from their use.
- Minimum age 13; under 18 requires guardian permission.
- Context worth knowing: a 2025 court order forced extra retention of Apr–Sep 2025
  data; that obligation ended 2025-09-26 and OpenAI returned to standard 30-day.
- Sources: openai.com/policies/row-terms-of-use; openai.com/enterprise-privacy;
  developers.openai.com/api/docs/guides/your-data.

## Anthropic — LOW
Commercial terms assessed ~June 2026. `tosVersion: anth-2026-06-27`.
- **Commercial/API content is excluded from training by default** — and was
  explicitly excluded from the Sept-2025 consumer changes (the 5-year retention +
  opt-out-training rules are *consumer only*, not API).
- **Not retained by default** on the API; Anthropic designs for the smallest footprint.
- **Model-specific retention:** certain "Covered Models" require a mandatory ~30-day
  retention with **no ZDR option** (e.g., safety-designated models). Worth explicit
  consent because it overrides a zero-retention preference.
- **Even under a ZDR agreement**, User-Safety classifier results are still retained to
  enforce the usage policy.
- Output ownership assigned to the user; liability cap present.
- Sources: anthropic.com/news/updates-to-our-consumer-terms;
  platform.claude.com/docs (api-and-data-retention); privacy.claude.com (ZDR scope).

## Gate content produced (drop-in)
`gateway/policy/provider-tos-content.ts` — for each provider: a severity, a warning
(shown before the quiz), a breakdown link, and a `QuestionPack` (2–3 MCQs, 100% to
pass). Matches your `QuestionPack` type exactly; compiles + tests green.

Manifest updated to the real `tosVersion`s and re-signed.

## Integration steps (for Code)
1. Replace the `FIXTURE_QUESTION_CONTENT` placeholder in `question-bank.ts` with the
   packs from `provider-tos-content.ts` (or import them directly).
2. Confirm `gateway/policy/fixtures/tos-manifest.json` holds the real `tosVersion`s,
   then **re-sign in your repo**: `node scripts/sign-manifest.mjs` regenerates the
   test keypair, signs the manifest, and prints the public key — paste it into
   `PINNED_MANIFEST_PUBLIC_KEY` in `tos-manifest.ts`.
3. `npm run verify` — green.

## What still needs a human (only you / counsel)
- **One legal sanity-check pass** on the flagged clauses + question wording before the
  gate goes live to end users. Everything is accurate to published terms; this is the
  responsible bar for consent-gating content, not a gap in the work.
- Production: point the manifest client at your signed endpoint and swap the pinned
  test key for the real one (the ~30-min task).
