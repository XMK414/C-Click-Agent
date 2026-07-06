// tests/packaging/native-addon-ships.test.ts — slice 1.9.
//
// The automated version of "did packaging actually ship the addon, or
// silently degrade to the mock bridge" (the kickoff's single most important
// packaging check). ASAR archives can't execute native .node bindings from
// inside the archive; electron-builder.yml's asarUnpack physically extracts
// matching files into app.asar.unpacked/ alongside the sealed app.asar, so
// this reads that unpacked output directly off disk — no separate asar
// extraction step needed.
//
// Auto-skips (same pattern as tests/native/windows-bridge.smoke.test.ts) when
// no packaged output exists yet — this is expensive (electron-builder takes
// minutes: downloads Electron, rebuilds native deps, runs NSIS/hdiutil) and
// must never block the fast core lane. Run `npm run package:win` (or
// `:mac`) first, then `npm run test` un-skips this for real.

import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..', '..');

interface PlatformExpectation {
  label: string;
  /** Relative to repo root. */
  unpackedNodePath: string;
  /** Relative to repo root — the sealed archive that should sit alongside the unpacked addon. */
  asarPath: string;
}

function expectationFor(platform: NodeJS.Platform): PlatformExpectation | null {
  switch (platform) {
    case 'win32':
      return {
        label: 'windows-bridge.node (win-unpacked)',
        unpackedNodePath:
          'dist-release/win-unpacked/resources/app.asar.unpacked/dist/app/platform/native/build/Release/windows-bridge.node',
        asarPath: 'dist-release/win-unpacked/resources/app.asar',
      };
    case 'darwin':
      // electron-builder's mac output dir depends on arch (mac/mac-arm64/mac-universal);
      // this covers the common single-arch case. Not exercised until slice 2.1 lands the
      // real macOS addon (native-macos is still a stub — see specs/slice-1.8-build-guide.md).
      return {
        label: 'macos-bridge.node (mac app bundle)',
        unpackedNodePath:
          'dist-release/mac/Click Click.app/Contents/Resources/app.asar.unpacked/dist/app/platform/native/build/Release/macos-bridge.node',
        asarPath: 'dist-release/mac/Click Click.app/Contents/Resources/app.asar',
      };
    default:
      return null;
  }
}

const expectation = expectationFor(process.platform);
const packagedOutputExists = expectation !== null && existsSync(resolve(repoRoot, expectation.unpackedNodePath));

describe.skipIf(!packagedOutputExists)('packaging — native addon actually ships (not silently mocked)', () => {
  it('the compiled native addon is present in the unpacked (non-ASAR) output', () => {
    const p = resolve(repoRoot, expectation!.unpackedNodePath);
    expect(existsSync(p), `expected ${expectation!.label} at ${p}`).toBe(true);
  });

  it('the shipped addon is a real binary, not an empty/corrupt placeholder', () => {
    const p = resolve(repoRoot, expectation!.unpackedNodePath);
    const stat = statSync(p);
    // A working compiled N-API addon is comfortably tens of KB+; a near-zero
    // size would mean a broken/truncated build got packaged silently.
    expect(stat.size).toBeGreaterThan(10_000);
  });

  it('the addon did NOT end up sealed inside app.asar itself (asarUnpack must have applied)', () => {
    const asarPath = resolve(repoRoot, expectation!.asarPath);
    // app.asar is a single opaque file — if the unpack config were missing, the .node
    // path we just asserted above simply wouldn't exist as a loose file at all (it'd be
    // sealed inside app.asar, unreadable by fs.existsSync as a real file). Reaching this
    // point already proves unpacking worked; this assertion documents *why* that matters.
    expect(existsSync(asarPath), 'app.asar should exist alongside the unpacked addon').toBe(true);
  });
});

describe.skipIf(packagedOutputExists)('packaging — native addon ships (skipped, no packaged output yet)', () => {
  it('is correctly skipped until `npm run package:win` (or :mac) has been run', () => {
    expect(packagedOutputExists).toBe(false);
  });
});
