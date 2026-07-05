// tests/gateway/openrouter.test.ts

import { describe, it, expect, vi, afterEach } from 'vitest';
import { chat, UpstreamFormatError } from '../../gateway/providers/openrouter.js';

const SECRET_KEY = 'sk-super-secret-value-12345';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function completionWith(content: string): unknown {
  return { choices: [{ message: { content } }] };
}

const validGuidance = { steps: [{ text: 'Click the gear icon' }], mode: 'guide' as const };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openrouter.chat', () => {
  it('parses a well-formed completion into a GuidanceResponse', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, completionWith(JSON.stringify(validGuidance))));
    vi.stubGlobal('fetch', fetchMock);

    const result = await chat({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'help' }],
      apiKey: SECRET_KEY,
    });

    expect(result).toEqual(validGuidance);
    // The key is used, never echoed back.
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
  });

  it('sends the key only as a Bearer Authorization header, never elsewhere', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, completionWith(JSON.stringify(validGuidance))));
    vi.stubGlobal('fetch', fetchMock);

    await chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).not.toContain(SECRET_KEY);
    expect(init.body as string).not.toContain(SECRET_KEY);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ' + SECRET_KEY);
  });

  it('retries once on malformed JSON, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, completionWith('not json at all')))
      .mockResolvedValueOnce(jsonResponse(200, completionWith(JSON.stringify(validGuidance))));
    vi.stubGlobal('fetch', fetchMock);

    const result = await chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY });
    expect(result).toEqual(validGuidance);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a key-free UpstreamFormatError after a second malformed reply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, completionWith('nope')))
      .mockResolvedValueOnce(jsonResponse(200, completionWith('still nope')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY }),
    ).rejects.toThrow(UpstreamFormatError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws UpstreamFormatError (no key) on a non-2xx upstream response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid key' }));
    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamFormatError);
    expect((caught as Error).message).not.toContain(SECRET_KEY);
  });

  it('throws UpstreamFormatError (no key) on a network failure, without leaking the request', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UpstreamFormatError);
    expect((caught as Error).message).not.toContain(SECRET_KEY);
  });

  it('throws UpstreamFormatError when the completion has no content field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY }),
    ).rejects.toThrow(UpstreamFormatError);
  });

  it('rejects a completion that is valid JSON but does not match the GuidanceResponse schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, completionWith(JSON.stringify({ not: 'guidance' }))));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], apiKey: SECRET_KEY }),
    ).rejects.toThrow(UpstreamFormatError);
  });
});
