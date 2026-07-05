// gateway/policy/pass-store.ts
//
// The gateway's AUTHORITATIVE pass-record store (plan FS-C). The client-side
// localStorage copy is a UX convenience; this is the one that gates /chat and
// /vision. Persists to a single JSON file under an injectable data dir so the
// gateway process can restart without silently re-locking every provider.
//
// GatePassRecord carries no secrets (see critical-tos-gate.ts) — this module
// must keep it that way: never write anything else into the data dir.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { GatePassRecord, ProviderId } from './critical-tos-gate.js';

export interface PassStore {
  get(deviceId: string, provider: ProviderId): GatePassRecord | null;
  put(record: GatePassRecord): void;
  all(): GatePassRecord[];
}

const FILE_NAME = 'gate-passes.json';

/** `<appData>/click-click/data` — a sibling of the (future) `<appData>/click-click/logs`. */
export function defaultPassStoreDataDir(): string {
  const appData =
    process.env.APPDATA ??
    (process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support')
      : join(homedir(), '.local', 'share'));
  return join(appData, 'click-click', 'data');
}

function keyOf(deviceId: string, provider: ProviderId): string {
  return JSON.stringify([deviceId, provider]);
}

function loadFromDisk(filePath: string): GatePassRecord[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8');
  if (raw.trim().length === 0) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed as GatePassRecord[];
}

/** Write the full record set atomically: write a temp file, then rename over the target. */
function writeToDisk(dataDir: string, filePath: string, records: GatePassRecord[]): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const tmpPath = join(dataDir, '.' + FILE_NAME + '.' + randomBytes(4).toString('hex') + '.tmp');
  writeFileSync(tmpPath, JSON.stringify(records, null, 2));
  renameSync(tmpPath, filePath);
}

/**
 * Create (or re-open) the pass store rooted at `dataDir`. Re-instantiating from
 * the same dir after a restart returns every previously persisted pass.
 */
export function createPassStore(dataDir: string = defaultPassStoreDataDir()): PassStore {
  const filePath = join(dataDir, FILE_NAME);
  const byKey = new Map<string, GatePassRecord>();
  for (const record of loadFromDisk(filePath)) {
    byKey.set(keyOf(record.userOrDeviceId, record.provider), record);
  }

  const persist = (): void => {
    writeToDisk(dataDir, filePath, [...byKey.values()]);
  };

  return {
    get(deviceId: string, provider: ProviderId): GatePassRecord | null {
      return byKey.get(keyOf(deviceId, provider)) ?? null;
    },
    put(record: GatePassRecord): void {
      byKey.set(keyOf(record.userOrDeviceId, record.provider), record);
      persist();
    },
    all(): GatePassRecord[] {
      return [...byKey.values()];
    },
  };
}
