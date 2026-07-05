// gateway/server.ts — Express gateway on 127.0.0.1 ONLY. Slice 1.6.
//
// Enforcement order on /chat, /vision, /mcp/tool (FS-C), all BEFORE any upstream
// call:
//   1. Bearer auth      (gateway/auth.ts — authorize())
//   2. Gate check       (requiredGates() + evaluatePass() for EACH required gate)
//   3. Aggregator check (folded into requiredGates(): OpenAI-via-OpenRouter needs
//                        BOTH the OpenRouter and OpenAI passes)
//   4. resolveProvider() -> upstream fetch -> normalize via guidanceResponseSchema
//
// Bind 127.0.0.1 only · CORS deny-all · per-route rate limiting · zod on every body.
// Routes: POST /chat · POST /vision · POST /mcp/tool · GET|POST /gate/*

import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { authorize, generateLaunchToken } from './auth.js';
import { requiredGates, resolveProvider } from './providers/registry.js';
import { openRouterAdapter, UpstreamFormatError } from './providers/openrouter.js';
import type { UpstreamAdapter } from './providers/types.js';
import {
  evaluatePass,
  gradeAttempt,
  mintPassRecord,
  redactForClient,
  selectQuestions,
  type ManifestEntry,
  type QuestionPack,
} from './policy/critical-tos-gate.js';
import { entryFor, verifyAndParseManifest } from './policy/tos-manifest.js';
import { buildQuestionPack, randomPick } from './policy/question-bank.js';
import {
  GATE_CONTENT_LEGAL_REVIEW,
  PROVIDER_GATE_CONTENT,
  type ProviderGateContent,
} from './policy/provider-tos-content.js';
import { createPassStore, type PassStore } from './policy/pass-store.js';
import {
  chatRequestSchema,
  gateSubmitRequestSchema,
  guidanceResponseSchema,
  safeParse,
  visionRequestSchema,
} from '../app/ipc/schemas.js';

export interface GatewayLogger {
  info(message: string): void;
  error(message: string): void;
}

/** Routes everything through console.warn/error — the only console calls lint allows. */
const defaultLogger: GatewayLogger = {
  info: (message: string): void => console.warn('[gateway] ' + message),
  error: (message: string): void => console.error('[gateway] ' + message),
};

export const DEFAULT_DEVICE_ID = 'local-device';

function loadSignedFixtureManifest(): ManifestEntry[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtureDir = resolve(here, 'policy', 'fixtures');
  const bytes = readFileSync(resolve(fixtureDir, 'tos-manifest.json'));
  const signature = readFileSync(resolve(fixtureDir, 'tos-manifest.json.sig'), 'utf8').trim();
  return verifyAndParseManifest(bytes, signature);
}

// --- simple per-key token bucket, used for per-route rate limiting ---
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  take(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.lastRefill = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function rateLimiter(capacity: number, refillPerSecond: number) {
  const buckets = new Map<string, TokenBucket>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(capacity, refillPerSecond / 1000);
      buckets.set(key, bucket);
    }
    if (!bucket.take()) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    next();
  };
}

interface AskedQuiz {
  tosVersion: string;
  questionsVersion: string;
  questionIds: string[];
}

export interface CreateGatewayOptions {
  token?: string;
  passStore?: PassStore;
  manifestEntries?: ManifestEntry[];
  deviceId?: string;
  logger?: GatewayLogger;
  upstreamAdapter?: UpstreamAdapter;
  now?: () => Date;
  /** Test seam: defaults to the real, scanned PROVIDER_GATE_CONTENT. */
  gateContent?: Readonly<Record<string, ProviderGateContent>>;
}

export interface GatewayServer {
  app: Express;
  token: string;
  setManifest(entries: ManifestEntry[]): void;
  getManifest(): ManifestEntry[];
  listen(port?: number): Promise<Server>;
}

function attemptKey(deviceId: string, provider: string): string {
  return JSON.stringify([deviceId, provider]);
}

function gateCheck(
  providerId: string,
  model: string,
  manifest: ManifestEntry[],
  passStore: PassStore,
  deviceId: string,
): { ok: true } | { ok: false; status: number; body: { error: string; provider?: string; reason?: string } } {
  let gates: string[];
  try {
    gates = requiredGates(providerId, model);
  } catch {
    return { ok: false, status: 400, body: { error: 'unknown_provider' } };
  }
  for (const gate of gates) {
    const entry = entryFor(manifest, gate);
    if (!entry) {
      return { ok: false, status: 403, body: { error: 'gate_not_passed', provider: gate, reason: 'no_pass' } };
    }
    const pass = passStore.get(deviceId, gate);
    const decision = evaluatePass(pass, entry);
    if (decision.status !== 'unlocked') {
      return { ok: false, status: 403, body: { error: 'gate_not_passed', provider: gate, reason: decision.reason } };
    }
  }
  return { ok: true };
}

export function createGatewayServer(options: CreateGatewayOptions = {}): GatewayServer {
  const token = options.token ?? generateLaunchToken();
  const passStore = options.passStore ?? createPassStore();
  const deviceId = options.deviceId ?? DEFAULT_DEVICE_ID;
  const logger = options.logger ?? defaultLogger;
  const upstreamAdapter = options.upstreamAdapter ?? openRouterAdapter;
  const now = options.now ?? ((): Date => new Date());
  const gateContent = options.gateContent ?? PROVIDER_GATE_CONTENT;

  if (!GATE_CONTENT_LEGAL_REVIEW.reviewed) {
    logger.info('⚠ Gate content not legal-reviewed — not for production.');
  }

  let manifest: ManifestEntry[] = options.manifestEntries ?? loadSignedFixtureManifest();
  const askedQuizzes = new Map<string, AskedQuiz>();
  const attemptCounts = new Map<string, number>();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // CORS deny-all + baseline hardening headers, before anything else runs.
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.headers.origin !== undefined) {
      res.status(403).json({ error: 'cors_denied' });
      return;
    }
    next();
  });

  // Bearer auth on EVERY route, no exceptions.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!authorize(token, req.headers.authorization)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  const gateLimiter = rateLimiter(100, 50);
  const chatLimiter = rateLimiter(30, 5);

  app.get('/gate/status', gateLimiter, (req: Request, res: Response) => {
    const providerId = String(req.query.provider ?? '');
    try {
      resolveProvider(providerId);
    } catch {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }
    const entry = entryFor(manifest, providerId);
    if (!entry) {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }
    const pass = passStore.get(deviceId, providerId);
    const decision = evaluatePass(pass, entry);
    if (decision.status === 'unlocked') {
      res.json({ unlocked: true });
    } else {
      res.json({ unlocked: false, reason: decision.reason });
    }
  });

  app.get('/gate/quiz', gateLimiter, (req: Request, res: Response) => {
    const providerId = String(req.query.provider ?? '');
    try {
      resolveProvider(providerId);
    } catch {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }
    const entry = entryFor(manifest, providerId);
    if (!entry) {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }
    const content = gateContent[providerId];
    if (!content) {
      // Known to the registry + manifest, but no real gate content exists for it —
      // never silently fall back to an empty/fixture quiz.
      res.status(404).json({ error: 'no_gate_content' });
      return;
    }
    const fullPack = buildQuestionPack(entry);
    const asked = selectQuestions(fullPack, 2, randomPick);
    askedQuizzes.set(attemptKey(deviceId, providerId), {
      tosVersion: entry.tosVersion,
      questionsVersion: entry.questionsVersion,
      questionIds: asked.map((q) => q.id),
    });
    res.json({
      warning: content.warning,
      detailsUrl: content.breakdownUrl,
      questions: asked.map(redactForClient),
    });
  });

  app.post('/gate/submit', gateLimiter, (req: Request, res: Response) => {
    const parsed = safeParse(gateSubmitRequestSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { provider, answers } = parsed.value;
    try {
      resolveProvider(provider);
    } catch {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }
    const entry = entryFor(manifest, provider);
    if (!entry) {
      res.status(400).json({ error: 'unknown_provider' });
      return;
    }

    const key = attemptKey(deviceId, provider);
    const asked = askedQuizzes.get(key);
    if (!asked || asked.tosVersion !== entry.tosVersion || asked.questionsVersion !== entry.questionsVersion) {
      res.status(400).json({ error: 'no_active_quiz' });
      return;
    }

    const fullPack = buildQuestionPack(entry);
    const askedQuestions = fullPack.questions.filter((q) => asked.questionIds.includes(q.id));
    const gradingPack: QuestionPack = {
      provider,
      tosVersion: entry.tosVersion,
      questionsVersion: entry.questionsVersion,
      questions: askedQuestions,
    };
    const result = gradeAttempt(gradingPack, answers);

    const count = (attemptCounts.get(key) ?? 0) + 1;
    attemptCounts.set(key, count);
    logger.info(
      'gate attempt provider=' + provider + ' tosVersion=' + entry.tosVersion + ' passed=' + String(result.passed) + ' attempt=' + String(count),
    );

    // Consumed either way: a fail forces a fresh /gate/quiz (rotates the set).
    askedQuizzes.delete(key);

    if (result.passed) {
      passStore.put(mintPassRecord(deviceId, gradingPack, now()));
      res.json({ unlocked: true });
    } else {
      res.json({ unlocked: false, missedTopics: result.missedTopics });
    }
  });

  app.post('/chat', chatLimiter, async (req: Request, res: Response) => {
    const parsed = safeParse(chatRequestSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { provider, model, messages } = parsed.value;

    // Gate is enforced before any upstream call — and before we even require a
    // key — so a malformed/keyless request can never be used to probe past it.
    const gate = gateCheck(provider, model, manifest, passStore, deviceId);
    if (!gate.ok) {
      res.status(gate.status).json(gate.body);
      return;
    }

    const apiKey = req.header('X-Provider-Key');
    if (!apiKey) {
      res.status(400).json({ error: 'missing_provider_key' });
      return;
    }

    if (provider !== 'openrouter') {
      // Direct BYO-key adapters for openai/anthropic land in a later slice.
      res.status(501).json({ error: 'not_implemented' });
      return;
    }

    try {
      const guidance = await upstreamAdapter.chat({ model, messages, apiKey });
      const validated = safeParse(guidanceResponseSchema, guidance);
      if (!validated.ok) {
        res.status(502).json({ error: 'upstream_format_error' });
        return;
      }
      res.json(validated.value);
    } catch (err) {
      if (err instanceof UpstreamFormatError) {
        res.status(502).json({ error: 'upstream_format_error' });
        return;
      }
      logger.error('chat upstream call failed: ' + (err instanceof Error ? err.name : 'unknown_error'));
      res.status(502).json({ error: 'upstream_error' });
    }
  });

  app.post('/vision', chatLimiter, (req: Request, res: Response) => {
    const parsed = safeParse(visionRequestSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { provider, model } = parsed.value;

    const gate = gateCheck(provider, model, manifest, passStore, deviceId);
    if (!gate.ok) {
      res.status(gate.status).json(gate.body);
      return;
    }

    // Screen capture is P2 — no upstream call happens yet, so no key is required
    // here. Auth + gate enforcement above is the real, tested part of this route
    // for slice 1.6.
    res.status(501).json({ error: 'not_implemented' });
  });

  app.post('/mcp/tool', gateLimiter, (req: Request, res: Response) => {
    const parsed = safeParse(visionRequestSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const { provider, model } = parsed.value;
    const gate = gateCheck(provider, model, manifest, passStore, deviceId);
    if (!gate.ok) {
      res.status(gate.status).json(gate.body);
      return;
    }
    // MCP tool execution is Phase 3 — the auth + gate wrapper above is real.
    res.status(501).json({ error: 'not_implemented' });
  });

  return {
    app,
    token,
    setManifest(entries: ManifestEntry[]): void {
      manifest = entries;
    },
    getManifest(): ManifestEntry[] {
      return manifest;
    },
    listen(port = 0): Promise<Server> {
      return new Promise((res, rej) => {
        const server = app.listen(port, '127.0.0.1', () => res(server));
        server.on('error', rej);
      });
    },
  };
}
