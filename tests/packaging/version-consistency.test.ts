// tests/packaging/version-consistency.test.ts — slice 1.9.
//
// electron-builder stamps package.json's own "version" field into the
// installer (there's no separate version field to drift in
// electron-builder.yml — that's the point of this test: prove there's
// nothing else claiming to own the version, so a bump to package.json is
// the single place that changes it).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

const repoRoot = resolve(import.meta.dirname, '..', '..');

interface ElectronBuilderConfig {
  version?: string;
}

describe('packaging — version consistency', () => {
  it('package.json has a real semver version', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('electron-builder.yml does not declare its own version (would silently override package.json\'s)', () => {
    const config = load(readFileSync(resolve(repoRoot, 'electron-builder.yml'), 'utf8')) as ElectronBuilderConfig;
    expect(config.version).toBeUndefined();
  });

  it('package.json declares "main" pointing at the compiled entry electron-builder packages', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
    expect(pkg.main).toBe('dist/app/main.js');
  });
});
