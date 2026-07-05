// tests/gateway/server.test.ts
//
// Supertest against the Express app. This is the slice's live security suite —
// see also tests/gateway/security-suite.test.ts for the cross-cutting checks.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { createGatewayServer, type GatewayLogger } from '../../gateway/server.js';
import { createPassStore } from '../../gateway/policy/pass-store.js';
import { mintPassRecord, type ManifestEntry } from '../../gateway/policy/critical-tos-gate.js';
import { buildQuestionPack } from '../../gateway/policy/question-bank.js';
import { PROVIDER_GATE_CONTENT } from '../../gateway/policy/provider-tos-content.js';
import type { UpstreamAdapter } from '../../gateway/providers/types.js';
import { UpstreamFormatError } from '../../gateway/providers/openrouter.js';
import type { GuidanceResponse } from '../../app/models/types.js';

const TOKEN = 'test-launch-token';
const SECRET_KEY = 'sk-super-secret-value-98765';

const MANIFEST: ManifestEntry[] = [
  { provider: 'openrouter', tosVersion: 'or-v1', questionsVersion: 'or-q1' },
  { provider: 'openai', tosVersion: 'oai-v1', questionsVersion: 'oai-q1' },
  { provider: 'anthropic', tosVersion: 'anth-v1', questionsVersion: 'anth-q1' },
];

const stubAdapter: UpstreamAdapter = {
  chat: async (): Promise<GuidanceResponse> => ({ steps: [{ text: 'ok' }], mode: 'guide' }),
};

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cc-gateway-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const silentLogger: GatewayLogger = { info: () => {}, error: () => {} };

function makeServer(overrides: Partial<Parameters<typeof createGatewayServer>[0]> = {}) {
  return createGatewayServer({
    token: TOKEN,
    passStore: createPassStore(dir),
    manifestEntries: MANIFEST,
    upstreamAdapter: stubAdapter,
    logger: silentLogger,
    ...overrides,
  });
}

function auth(): string {
  return 'Bearer ' + TOKEN;
}

describe('bearer auth on every route', () => {
  const routes: Array<{ method: 'get' | 'post'; path: string }> = [
    { method: 'get', path: '/gate/status?provider=openrouter' },
    { method: 'get', path: '/gate/quiz?provider=openrouter' },
    { method: 'post', path: '/gate/submit' },
    { method: 'post', path: '/chat' },
    { method: 'post', path: '/vision' },
    { method: 'post', path: '/mcp/tool' },
  ];

  it.each(routes)('401s on $method $path with no token', async ({ method, path }) => {
    const gw = makeServer();
    const res = await request(gw.app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(routes)('401s on $method $path with the wrong token', async ({ method, path }) => {
    const gw = makeServer();
    const res = await request(gw.app)[method](path).set('Authorization', 'Bearer nope').send({});
    expect(res.status).toBe(401);
  });
});

describe('CORS deny-all', () => {
  it('rejects any request carrying an Origin header, even with a valid token', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .get('/gate/status?provider=openrouter')
      .set('Authorization', auth())
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('sets X-Content-Type-Options: nosniff', async () => {
    const gw = makeServer();
    const res = await request(gw.app).get('/gate/status?provider=openrouter').set('Authorization', auth());
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('server binds 127.0.0.1 only', () => {
  it('the listening address is 127.0.0.1', async () => {
    const gw = makeServer();
    const server = await gw.listen(0);
    try {
      const addr = server.address() as AddressInfo;
      expect(addr.address).toBe('127.0.0.1');
    } finally {
      server.close();
    }
  });
});

describe('/chat gate enforcement', () => {
  it('403s gate_not_passed when no pass exists', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('gate_not_passed');
  });

  it('403s when the stored pass no longer matches the (bumped) manifest tosVersion', async () => {
    const passStore = createPassStore(dir);
    const entry = MANIFEST[0]!;
    passStore.put(mintPassRecord('local-device', buildQuestionPack(entry)));
    const gw = makeServer({ passStore });

    const okRes = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(okRes.status).toBe(200);

    gw.setManifest([{ ...entry, tosVersion: 'or-v2' }, ...MANIFEST.slice(1)]);

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'gate_not_passed', provider: 'openrouter', reason: 'tos_version_changed' });
  });

  it('aggregator: an OpenAI model via OpenRouter needs BOTH gates', async () => {
    const passStore = createPassStore(dir);
    const openrouterEntry = MANIFEST[0]!;
    passStore.put(mintPassRecord('local-device', buildQuestionPack(openrouterEntry)));
    const gw = makeServer({ passStore });

    // OpenRouter alone is not enough for an openai/* model.
    const onlyOpenrouter = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(onlyOpenrouter.status).toBe(403);
    expect(onlyOpenrouter.body.error).toBe('gate_not_passed');

    // Now add the OpenAI pass too -> unlocked.
    const openaiEntry = MANIFEST[1]!;
    passStore.put(mintPassRecord('local-device', buildQuestionPack(openaiEntry)));

    const both = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(both.status).toBe(200);
  });

  it('a non-aggregated model only needs the OpenRouter gate', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ steps: [{ text: 'ok' }], mode: 'guide' });
  });
});

describe('no key material anywhere', () => {
  it('the X-Provider-Key value never appears in a log line or the /chat response', async () => {
    const logs: string[] = [];
    const spyLogger: GatewayLogger = {
      info: (m) => logs.push(m),
      error: (m) => logs.push(m),
    };
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore, logger: spyLogger });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_KEY);
    expect(logs.join('\n')).not.toContain(SECRET_KEY);
    // And never persisted to the pass store either.
    expect(JSON.stringify(passStore.all())).not.toContain(SECRET_KEY);
  });
});

describe('real gate content — redaction holds for every launch provider', () => {
  it.each(['openrouter', 'openai', 'anthropic'] as const)(
    '%s: /gate/quiz serves the real warning/breakdownUrl and never a correctIndex',
    async (provider) => {
      const gw = makeServer();
      const res = await request(gw.app).get('/gate/quiz?provider=' + provider).set('Authorization', auth());
      expect(res.status).toBe(200);
      expect(typeof res.body.warning).toBe('string');
      expect(res.body.warning.length).toBeGreaterThan(0);
      expect(typeof res.body.detailsUrl).toBe('string');
      expect(res.body.questions.length).toBeGreaterThan(0);
      expect(JSON.stringify(res.body)).not.toContain('correctIndex');
    },
  );
});

describe('/gate/quiz — content missing (defensive, forward-looking)', () => {
  it('404s no_gate_content when a provider resolves via registry + manifest but has no gate content', async () => {
    // Simulates a provider added to the registry/manifest before its ToS scan lands.
    const { anthropic: _anthropic, ...withoutAnthropic } = PROVIDER_GATE_CONTENT;
    const gw = makeServer({ gateContent: withoutAnthropic });
    const res = await request(gw.app).get('/gate/quiz?provider=anthropic').set('Authorization', auth());
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'no_gate_content' });
  });
});

describe('gate 100% at the HTTP layer', () => {
  it('one wrong answer -> unlocked:false, missedTopics present, no answer key leaked', async () => {
    const gw = makeServer();
    const quiz = await request(gw.app).get('/gate/quiz?provider=openrouter').set('Authorization', auth());
    expect(quiz.status).toBe(200);
    expect(JSON.stringify(quiz.body)).not.toContain('correctIndex');

    const answers: Record<string, number> = {};
    for (const q of quiz.body.questions as Array<{ id: string }>) {
      answers[q.id] = -1; // guaranteed wrong for every fixture question
    }

    const submit = await request(gw.app)
      .post('/gate/submit')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', answers });

    expect(submit.status).toBe(200);
    expect(submit.body.unlocked).toBe(false);
    expect(Array.isArray(submit.body.missedTopics)).toBe(true);
    expect(submit.body.missedTopics.length).toBeGreaterThan(0);
    expect(JSON.stringify(submit.body)).not.toContain('correctIndex');
  });

  it('all correct answers -> unlocked:true and /gate/status reflects it', async () => {
    const gw = makeServer();
    const quiz = await request(gw.app).get('/gate/quiz?provider=openrouter').set('Authorization', auth());

    const fullPack = buildQuestionPack(MANIFEST[0]!);
    const correctById = new Map(fullPack.questions.map((q) => [q.id, q.correctIndex]));
    const answers: Record<string, number> = {};
    for (const q of quiz.body.questions as Array<{ id: string }>) {
      answers[q.id] = correctById.get(q.id)!;
    }

    const submit = await request(gw.app)
      .post('/gate/submit')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', answers });
    expect(submit.body).toEqual({ unlocked: true });

    const status = await request(gw.app).get('/gate/status?provider=openrouter').set('Authorization', auth());
    expect(status.body).toEqual({ unlocked: true });
  });
});

describe('pass persistence across a gateway restart', () => {
  it('a pass minted via /gate/submit survives re-instantiating the pass store', async () => {
    const gw = makeServer();
    const quiz = await request(gw.app).get('/gate/quiz?provider=openrouter').set('Authorization', auth());
    const fullPack = buildQuestionPack(MANIFEST[0]!);
    const correctById = new Map(fullPack.questions.map((q) => [q.id, q.correctIndex]));
    const answers: Record<string, number> = {};
    for (const q of quiz.body.questions as Array<{ id: string }>) {
      answers[q.id] = correctById.get(q.id)!;
    }
    await request(gw.app).post('/gate/submit').set('Authorization', auth()).send({ provider: 'openrouter', answers });

    // Fresh store + fresh server instance, same dir -> the pass is still there.
    const gw2 = makeServer({ passStore: createPassStore(dir) });
    const status = await request(gw2.app).get('/gate/status?provider=openrouter').set('Authorization', auth());
    expect(status.body).toEqual({ unlocked: true });
  });
});

describe('unknown provider handling', () => {
  it('gate/status: 400 for a provider the registry does not know', async () => {
    const gw = makeServer();
    const res = await request(gw.app).get('/gate/status?provider=nope').set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_provider' });
  });

  it('gate/status: 400 when the provider is known but absent from the manifest', async () => {
    const gw = makeServer({ manifestEntries: [MANIFEST[1]!, MANIFEST[2]!] }); // no openrouter entry
    const res = await request(gw.app).get('/gate/status?provider=openrouter').set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_provider' });
  });

  it('gate/quiz: 400 for a provider unknown to the registry', async () => {
    const gw = makeServer();
    const res = await request(gw.app).get('/gate/quiz?provider=nope').set('Authorization', auth());
    expect(res.status).toBe(400);
  });

  it('gate/quiz: 400 when the provider is known but absent from the manifest', async () => {
    const gw = makeServer({ manifestEntries: [MANIFEST[1]!, MANIFEST[2]!] }); // no openrouter entry
    const res = await request(gw.app).get('/gate/quiz?provider=openrouter').set('Authorization', auth());
    expect(res.status).toBe(400);
  });

  it('/chat: 403 gate_not_passed when a REQUIRED aggregator gate has no manifest entry at all', async () => {
    // openrouter passes, but the manifest has no 'openai' entry to even evaluate against —
    // requiredGates() still demands it for an openai/* model routed through openrouter.
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore, manifestEntries: [MANIFEST[0]!] }); // no openai entry

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'gate_not_passed', provider: 'openai', reason: 'no_pass' });
  });

  it('gate/submit: 400 on an invalid body', async () => {
    const gw = makeServer();
    const res = await request(gw.app).post('/gate/submit').set('Authorization', auth()).send({ nope: true });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_request' });
  });

  it('gate/submit: 400 for a provider unknown to the registry', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/gate/submit')
      .set('Authorization', auth())
      .send({ provider: 'nope', answers: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_provider' });
  });

  it('gate/submit: 400 when the provider is known but absent from the manifest', async () => {
    const gw = makeServer({ manifestEntries: [MANIFEST[1]!, MANIFEST[2]!] }); // no openrouter entry
    const res = await request(gw.app)
      .post('/gate/submit')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', answers: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_provider' });
  });

  it('gate/submit: 400 no_active_quiz when submitted without first fetching a quiz', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/gate/submit')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', answers: {} });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'no_active_quiz' });
  });
});

describe('/chat additional branches', () => {
  it('400s missing_provider_key when the gate is open but no key header is sent', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_provider_key' });
  });

  it('400s on an invalid body', async () => {
    const gw = makeServer();
    const res = await request(gw.app).post('/chat').set('Authorization', auth()).send({ nope: true });
    expect(res.status).toBe(400);
  });

  it('400s unknown_provider when the gate check itself cannot resolve the provider', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'nope', model: 'whatever', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'unknown_provider' });
  });

  it('501s for a direct (non-openrouter) provider — no adapter wired yet', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[2]!)));
    const gw = makeServer({ passStore });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'anthropic', model: 'claude-3', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(501);
  });

  it('502s upstream_format_error when the adapter returns a shape that fails schema validation', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const badAdapter: UpstreamAdapter = {
      // Bypasses the adapter's own schema check to simulate a defense-in-depth catch.
      chat: async () => ({ nope: true }) as unknown as GuidanceResponse,
    };
    const gw = makeServer({ passStore, upstreamAdapter: badAdapter });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'upstream_format_error' });
  });

  it('502s upstream_format_error when the adapter throws UpstreamFormatError directly', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const throwingFormatAdapter: UpstreamAdapter = {
      chat: async () => {
        throw new UpstreamFormatError('model completion was not valid JSON');
      },
    };
    const gw = makeServer({ passStore, upstreamAdapter: throwingFormatAdapter });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'upstream_format_error' });
  });

  it('502s upstream_error and logs no key when the adapter throws a non-UpstreamFormatError', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const logs: string[] = [];
    const throwingAdapter: UpstreamAdapter = {
      chat: async () => {
        throw new Error('boom');
      },
    };
    const gw = makeServer({
      passStore,
      upstreamAdapter: throwingAdapter,
      logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
    });

    const res = await request(gw.app)
      .post('/chat')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: 'upstream_error' });
    expect(logs.join('\n')).not.toContain(SECRET_KEY);
  });
});

describe('/vision and /mcp/tool', () => {
  it('/vision enforces gate + auth and returns 501 when the gate is open', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore });

    const res = await request(gw.app)
      .post('/vision')
      .set('Authorization', auth())
      .set('X-Provider-Key', SECRET_KEY)
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b' });
    expect(res.status).toBe(501);
  });

  it('/vision 403s when the gate is not open, before touching the upstream body', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/vision')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b' });
    expect(res.status).toBe(403);
  });

  it('/mcp/tool enforces gate + auth and returns 501 when the gate is open', async () => {
    const passStore = createPassStore(dir);
    passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
    const gw = makeServer({ passStore });

    const res = await request(gw.app)
      .post('/mcp/tool')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b' });
    expect(res.status).toBe(501);
  });

  it('/mcp/tool 403s when the gate is not open', async () => {
    const gw = makeServer();
    const res = await request(gw.app)
      .post('/mcp/tool')
      .set('Authorization', auth())
      .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b' });
    expect(res.status).toBe(403);
  });

  it('/vision 400s on an invalid body', async () => {
    const gw = makeServer();
    const res = await request(gw.app).post('/vision').set('Authorization', auth()).send({ nope: true });
    expect(res.status).toBe(400);
  });

  it('/mcp/tool 400s on an invalid body', async () => {
    const gw = makeServer();
    const res = await request(gw.app).post('/mcp/tool').set('Authorization', auth()).send({ nope: true });
    expect(res.status).toBe(400);
  });
});

describe('default logger', () => {
  it('the built-in default logger (unspecified) routes info + error through console', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const passStore = createPassStore(dir);
      passStore.put(mintPassRecord('local-device', buildQuestionPack(MANIFEST[0]!)));
      const throwingAdapter: UpstreamAdapter = {
        chat: async () => {
          throw new Error('boom');
        },
      };
      // No `logger` override anywhere below — exercises the real default logger.
      const gw = createGatewayServer({ token: TOKEN, passStore, manifestEntries: MANIFEST, upstreamAdapter: throwingAdapter });
      expect(consoleWarn).toHaveBeenCalled(); // the startup legal-review notice

      const res = await request(gw.app)
        .post('/chat')
        .set('Authorization', auth())
        .set('X-Provider-Key', SECRET_KEY)
        .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] });
      expect(res.status).toBe(502);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    }
  });
});

describe('per-route rate limiting', () => {
  it('/chat 429s once the token bucket for a client is exhausted', async () => {
    const gw = makeServer();
    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        request(gw.app)
          .post('/chat')
          .set('Authorization', auth())
          .set('X-Provider-Key', SECRET_KEY)
          .send({ provider: 'openrouter', model: 'meta-llama/llama-3-70b', messages: [{ role: 'user', content: 'hi' }] }),
      ),
    );
    expect(results.some((r) => r.status === 429)).toBe(true);
  });
});

describe('getManifest()', () => {
  it('returns whatever setManifest() last set', () => {
    const gw = makeServer();
    gw.setManifest([MANIFEST[0]!]);
    expect(gw.getManifest()).toEqual([MANIFEST[0]!]);
  });
});

describe('default startup manifest', () => {
  it('loads and verifies the committed signed fixture when no manifestEntries override is given', () => {
    const gw = createGatewayServer({
      token: TOKEN,
      passStore: createPassStore(dir),
      upstreamAdapter: stubAdapter,
      logger: silentLogger,
    });
    const entries = gw.getManifest();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.find((e) => e.provider === 'openai')?.tosVersion).toBe('oai-2026-01-01');
  });
});
