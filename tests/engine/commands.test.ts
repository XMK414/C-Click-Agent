// tests/engine/commands.test.ts

import { describe, it, expect, vi } from 'vitest';
import { CommandRouter, type Command } from '../../app/engine/commands.js';

const cmd = (id: string, source: Command['source'] = 'keyboard'): Command => ({
  id,
  source,
  payload: {},
  timestamp: 0,
});

describe('CommandRouter', () => {
  it('dispatches an allowlisted command', async () => {
    const handler = vi.fn();
    const router = new CommandRouter({ 'panel.open': handler });
    const result = await router.dispatch(cmd('panel.open'));
    expect(result.status).toBe('dispatched');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('rejects an unknown command without calling any handler', async () => {
    const router = new CommandRouter({ 'panel.open': vi.fn() });
    const result = await router.dispatch(cmd('panel.destroy'));
    expect(result).toEqual({ status: 'unknown_command', id: 'panel.destroy' });
  });

  it('rate-limits per source within the window', async () => {
    let t = 1000;
    const router = new CommandRouter(
      { spam: vi.fn() },
      { rate: { max: 3, windowMs: 1000 }, now: () => t },
    );
    expect((await router.dispatch(cmd('spam'))).status).toBe('dispatched');
    expect((await router.dispatch(cmd('spam'))).status).toBe('dispatched');
    expect((await router.dispatch(cmd('spam'))).status).toBe('dispatched');
    expect((await router.dispatch(cmd('spam'))).status).toBe('rate_limited');
  });

  it('rate limit is per-source, not global', async () => {
    let t = 1000;
    const router = new CommandRouter(
      { go: vi.fn() },
      { rate: { max: 1, windowMs: 1000 }, now: () => t },
    );
    expect((await router.dispatch(cmd('go', 'keyboard'))).status).toBe('dispatched');
    expect((await router.dispatch(cmd('go', 'keyboard'))).status).toBe('rate_limited');
    // A different source has its own budget.
    expect((await router.dispatch(cmd('go', 'voice'))).status).toBe('dispatched');
  });

  it('the window slides — old hits expire', async () => {
    let t = 1000;
    const router = new CommandRouter(
      { go: vi.fn() },
      { rate: { max: 1, windowMs: 1000 }, now: () => t },
    );
    expect((await router.dispatch(cmd('go'))).status).toBe('dispatched');
    t += 1500; // advance beyond the window
    expect((await router.dispatch(cmd('go'))).status).toBe('dispatched');
  });

  it('emits an observability event on every dispatch', async () => {
    const onDispatch = vi.fn();
    const router = new CommandRouter({ go: vi.fn() }, { events: { onDispatch } });
    await router.dispatch(cmd('go'));
    expect(onDispatch).toHaveBeenCalledOnce();
    const [, latency, status] = onDispatch.mock.calls[0]!;
    expect(typeof latency).toBe('number');
    expect(status).toBe('dispatched');
  });

  it('knows() reflects the allowlist', () => {
    const router = new CommandRouter({ 'a.b': vi.fn() });
    expect(router.knows('a.b')).toBe(true);
    expect(router.knows('x.y')).toBe(false);
  });
});
