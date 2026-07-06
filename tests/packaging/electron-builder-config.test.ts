// tests/packaging/electron-builder-config.test.ts — slice 1.9.
//
// Catches a bad electron-builder.yml edit before a multi-minute package build
// proves it broken. Fast, runs in the core lane (no packaging needed) — unlike
// native-addon-ships.test.ts, which needs a real build to already exist.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const repoRoot = resolve(import.meta.dirname, '..', '..');

interface ElectronBuilderConfig {
  appId?: string;
  productName?: string;
  directories?: { output?: string; buildResources?: string };
  files?: string[];
  asarUnpack?: string[];
  asar?: boolean;
  disableAsarIntegrity?: boolean;
  disableSanityCheckAsar?: boolean;
  win?: { target?: string; icon?: string };
  mac?: { target?: string; icon?: string; hardenedRuntime?: boolean; gatekeeperAssess?: boolean };
  electronFuses?: {
    enableEmbeddedAsarIntegrityValidation?: boolean;
    onlyLoadAppFromAsar?: boolean;
  };
}

const configPath = resolve(repoRoot, 'electron-builder.yml');
const config = load(readFileSync(configPath, 'utf8')) as ElectronBuilderConfig;

describe('electron-builder.yml — config sanity (catches bad edits before a build proves it)', () => {
  it('has an appId and productName set', () => {
    expect(config.appId).toBeTruthy();
    expect(config.productName).toBeTruthy();
  });

  it('output directory is NOT the default "dist" (collides with the compiled app in dist/)', () => {
    expect(config.directories?.output).toBeTruthy();
    expect(config.directories!.output).not.toBe('dist');
  });

  it('asarUnpack includes *.node — without this the native addon ships sealed and unusable', () => {
    expect(config.asarUnpack).toBeDefined();
    expect(config.asarUnpack!.some((p) => p.includes('*.node'))).toBe(true);
  });

  it('asar is not disabled', () => {
    expect(config.asar).not.toBe(false);
  });

  it('ASAR integrity hash computation is not disabled (defaults to on; must not be silently turned off)', () => {
    expect(config.disableAsarIntegrity).not.toBe(true);
    expect(config.disableSanityCheckAsar).not.toBe(true);
  });

  it('the electron fuses that make ASAR integrity real at runtime are both enabled', () => {
    // enableEmbeddedAsarIntegrityValidation alone is not enough (see electron-builder.yml's
    // own comment): without onlyLoadAppFromAsar, a tampered unpacked copy sitting next to
    // app.asar could still be loaded, defeating the point of validating app.asar's hash.
    expect(config.electronFuses?.enableEmbeddedAsarIntegrityValidation).toBe(true);
    expect(config.electronFuses?.onlyLoadAppFromAsar).toBe(true);
  });

  it('win/mac targets and icons are configured, and the icon files actually resolve on disk', () => {
    expect(config.win?.target).toBeTruthy();
    expect(config.win?.icon).toBeTruthy();
    expect(existsSync(resolve(repoRoot, config.win!.icon!)), `win icon not found: ${config.win!.icon}`).toBe(true);

    expect(config.mac?.target).toBeTruthy();
    expect(config.mac?.icon).toBeTruthy();
    expect(existsSync(resolve(repoRoot, config.mac!.icon!)), `mac icon not found: ${config.mac!.icon}`).toBe(true);
  });

  it('mac.gatekeeperAssess is explicitly false, with the reason documented in-file (unsigned P1, not a permanent choice)', () => {
    expect(config.mac?.gatekeeperAssess).toBe(false);
    const raw = readFileSync(configPath, 'utf8');
    expect(raw).toMatch(/gatekeeperAssess/);
    expect(raw.toLowerCase()).toContain('unsigned');
  });
});
