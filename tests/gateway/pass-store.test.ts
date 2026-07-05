// tests/gateway/pass-store.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPassStore, defaultPassStoreDataDir } from '../../gateway/policy/pass-store.js';
import type { GatePassRecord } from '../../gateway/policy/critical-tos-gate.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cc-pass-store-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const samplePass: GatePassRecord = {
  userOrDeviceId: 'device-1',
  provider: 'openrouter',
  tosVersion: 'v1',
  questionsVersion: 'q1',
  timestamp: '2026-07-04T00:00:00.000Z',
};

describe('defaultPassStoreDataDir', () => {
  const originalAppData = process.env.APPDATA;
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

  afterEach(() => {
    if (originalAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = originalAppData;
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  });

  it('uses APPDATA when set', () => {
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    expect(defaultPassStoreDataDir()).toContain('click-click');
  });

  it('falls back to macOS Application Support when APPDATA is unset', () => {
    delete process.env.APPDATA;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(defaultPassStoreDataDir()).toContain('Application Support');
  });

  it('falls back to ~/.local/share on other platforms when APPDATA is unset', () => {
    delete process.env.APPDATA;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(defaultPassStoreDataDir().replaceAll('\\', '/')).toContain('.local/share');
  });
});

describe('pass-store', () => {
  it('returns null for a pass that was never put', () => {
    const store = createPassStore(dir);
    expect(store.get('device-1', 'openrouter')).toBeNull();
  });

  it('put then get round-trips the exact record', () => {
    const store = createPassStore(dir);
    store.put(samplePass);
    expect(store.get('device-1', 'openrouter')).toEqual(samplePass);
  });

  it('all() returns every persisted record', () => {
    const store = createPassStore(dir);
    store.put(samplePass);
    store.put({ ...samplePass, provider: 'openai', tosVersion: 'v2' });
    expect(store.all()).toHaveLength(2);
  });

  it('does not confuse two different devices for the same provider', () => {
    const store = createPassStore(dir);
    store.put(samplePass);
    store.put({ ...samplePass, userOrDeviceId: 'device-2', tosVersion: 'other' });
    expect(store.get('device-1', 'openrouter')?.tosVersion).toBe('v1');
    expect(store.get('device-2', 'openrouter')?.tosVersion).toBe('other');
  });

  it('survives restart: re-instantiating from the same dir returns prior passes', () => {
    const store1 = createPassStore(dir);
    store1.put(samplePass);

    const store2 = createPassStore(dir);
    expect(store2.get('device-1', 'openrouter')).toEqual(samplePass);
    expect(store2.all()).toHaveLength(1);
  });

  it('a later put for the same (device, provider) overwrites the earlier one', () => {
    const store = createPassStore(dir);
    store.put(samplePass);
    store.put({ ...samplePass, tosVersion: 'v2' });
    expect(store.all()).toHaveLength(1);
    expect(store.get('device-1', 'openrouter')?.tosVersion).toBe('v2');
  });

  it('creates the data dir on first write when it does not yet exist', () => {
    const nested = join(dir, 'nested', 'sub');
    expect(existsSync(nested)).toBe(false);
    const store = createPassStore(nested);
    store.put(samplePass);
    expect(existsSync(nested)).toBe(true);
    expect(createPassStore(nested).get('device-1', 'openrouter')).toEqual(samplePass);
  });

  it('treats an empty gate-passes.json as no passes', () => {
    writeFileSync(join(dir, 'gate-passes.json'), '');
    expect(createPassStore(dir).all()).toEqual([]);
  });

  it('treats a non-array gate-passes.json as no passes', () => {
    writeFileSync(join(dir, 'gate-passes.json'), JSON.stringify({ not: 'an array' }));
    expect(createPassStore(dir).all()).toEqual([]);
  });
});
