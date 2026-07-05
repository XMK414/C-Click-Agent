// gateway/providers/openrouter.ts — OpenRouter adapter. Slice 1.6.
//
// Direct-to-provider fetch FROM the user's machine (the local gateway runs on the
// user's device). The BYO key never transits Motion Activated infrastructure (§7).
// Parses raw completion -> GuidanceResponse, then guidanceResponseSchema-validated
// by the caller. One reformat retry on malformed JSON, then a typed, key-free
// UpstreamFormatError.
//
// Hard rule enforced throughout this file: `apiKey` is read once to build the
// Authorization header and never referenced again — not in a log line, not in a
// thrown error, not in any object that survives the call.

import { guidanceResponseSchema } from '../../app/ipc/schemas.js';
import type { GuidanceResponse } from '../../app/models/types.js';
import { resolveProvider } from './registry.js';
import type { UpstreamAdapter, UpstreamRequest } from './types.js';

export class UpstreamFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamFormatError';
  }
}

interface RawChoice {
  message?: { content?: unknown };
}
interface RawCompletion {
  choices?: RawChoice[];
}

function extractContent(body: unknown): string | null {
  const completion = body as RawCompletion;
  const content = completion?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : null;
}

async function callChatCompletions(
  apiKey: string,
  model: string,
  messages: UpstreamRequest['messages'],
): Promise<string> {
  const baseUrl = resolveProvider('openrouter').baseUrl;
  let res: Response;
  try {
    res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({ model, messages }),
    });
  } catch {
    // Network-level failure. Never include the request init (it holds the key).
    throw new UpstreamFormatError('OpenRouter request failed: network error');
  }

  if (!res.ok) {
    throw new UpstreamFormatError('OpenRouter request failed: HTTP ' + res.status);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await res.json();
  } catch {
    throw new UpstreamFormatError('OpenRouter response was not valid JSON');
  }

  const content = extractContent(parsedBody);
  if (content === null) {
    throw new UpstreamFormatError('OpenRouter response missing completion content');
  }
  return content;
}

function parseGuidance(raw: string): GuidanceResponse {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new UpstreamFormatError('model completion was not valid JSON');
  }
  const result = guidanceResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new UpstreamFormatError('model completion did not match the GuidanceResponse schema');
  }
  return result.data;
}

const REFORMAT_INSTRUCTION =
  'Your previous reply was not valid JSON matching the required schema ' +
  '({ steps: [{ text, point? }], mode: "guide" | "assist", actions?: [...] }). ' +
  'Reply again with ONLY that JSON object and nothing else — no prose, no code fences.';

/**
 * `apiKey` is used exactly once per attempt (initial + at most one reformat
 * retry) to build the Authorization header, then discarded. Never persisted,
 * never logged, never placed in a thrown error.
 */
export async function chat(req: UpstreamRequest): Promise<GuidanceResponse> {
  const { model, messages, apiKey } = req;

  const firstRaw = await callChatCompletions(apiKey, model, messages);
  try {
    return parseGuidance(firstRaw);
  } catch (firstError) {
    if (!(firstError instanceof UpstreamFormatError)) throw firstError;

    const retryMessages: UpstreamRequest['messages'] = [
      ...messages,
      { role: 'assistant', content: firstRaw },
      { role: 'user', content: REFORMAT_INSTRUCTION },
    ];
    const retryRaw = await callChatCompletions(apiKey, model, retryMessages);
    return parseGuidance(retryRaw); // a second failure propagates as UpstreamFormatError — no further retry
  }
}

export const openRouterAdapter: UpstreamAdapter = { chat };
