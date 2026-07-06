# Code Kickoff — Slice 1.9: Packaging (Windows `.exe`, macOS `.dmg`)

> Turns a working dev checkout into something a real person can download and run.
> Build **only slice 1.9**. Do the two open CI fixes from the branch-protection session
> FIRST (pin `windows-2022`; resolve the macOS e2e flake) — packaging on top of red CI
> means you can't trust the artifact. Do not advance any step while tests are red.

## Read first
- `specs/click-click.plan.md` §5 (build/packaging), §7 (security), §12 (kill switch,
  rollback) · `specs/electron-bump-scope.md` (the ASAR-integrity note deferred to here) ·
  `specs/slice-1.8-build-guide.md` (native addon now real — must ship compiled).
- `npm run verify` + `npm run test:e2e` both green, on a **repo whose CI is actually green**
  (confirm the two open CI issues are resolved before starting).

## The honest reality check (read before touching config)
1. **Code signing is a real gap, not a nice-to-have.** Without a code-signing certificate:
   - **Windows:** SmartScreen will show an "Unknown Publisher" warning on first run. The
     app still installs — it's a scary prompt, not a blocker — but it looks unsafe to a new
     user, which matters a lot for "everyone's first agent."
   - **macOS:** an unsigned/unnotarized `.dmg` gets Gatekeeper-blocked outright unless the
     user right-click→Open's it or disables Gatekeeper. This is a bigger deal than the
     Windows warning.
   - **Do NOT silently skip this and call packaging "done."** Ship P1 unsigned (that's a
     legitimate MVP call), but the DoD below requires it to be **stated, not hidden** —
     the demo doc must say "unsigned build, expect an OS warning" so it's a known
     trade-off, not a surprise QA finds later.
   - Getting a real cert (Windows: an EV/OV code-signing cert from a CA; macOS: an Apple
     Developer Program membership + notarization) is a **Kyle-only task** — it needs legal
     identity/payment info Code cannot provide. Flag it as an open item, don't block on it.
2. **The native addon must actually ship.** `electron-builder` needs explicit config to
   include `app/platform/native/build/Release/*.node` in the packaged `asar.unpack` list —
   ASAR archives can't execute native `.node` bindings from inside the archive. Get this
   wrong and the packaged app silently degrades to the mock bridge (guide-only) with zero
   error — exactly the "silent failure" class of bug the whole project has been built to
   avoid. This is the single most important thing to test on a genuinely clean machine.

## Scope — build these
1. `electron-builder.yml` (or `build` key in `package.json`) —
   - `appId`, `productName: "Click Click"`, `directories.output: dist-release`.
   - `files`: exclude `native/*.cpp`, `*.gyp`, source maps from prod; include compiled output.
   - `asarUnpack`: `["**/*.node"]` at minimum — verify the native addon actually unpacks
     (see native-addon test below).
   - `win.target: nsis`, `icon: assets/brand/icon.ico` (already exists from the brand work).
   - `mac.target: dmg`, `mac.icon: assets/brand/icon.png` (electron-builder derives `.icns`).
   - `mac.hardenedRuntime: true`, `mac.gatekeeperAssess: false` (until a real cert exists —
     document why in a comment).
   - **ASAR integrity:** enable the integrity digest (`asarIntegrity`/electron-builder's
     current stable mechanism for it — check the installed electron-builder version's docs,
     since the exact config key has moved between releases; don't guess, verify against the
     installed version). This is the tamper-detection win flagged back in the electron-bump
     task — first packaging slice is where it actually matters, since now there's a
     native binary worth protecting.
2. `scripts/package-win.sh` / `package.json` script `"package:win": "electron-builder --win"`
   (and `--mac` for the other target). Wire `prepackage` to run `npm run build:native:win`
   (or `:mac`) first so the freshest compiled addon ships.
3. **Kill-switch + tray wiring for the packaged app** (may already exist from 1.4/2.3 — audit,
   don't reimplement): confirm the tray "Quit Click Click" and the global kill-switch hotkey
   both work in the *packaged* app, not just `npm start`. Packaged Electron apps sometimes
   lose dev-only conveniences (devtools, hot reload) — confirm nothing load-bearing was
   dev-only.
4. `docs/demo-P1.md` (extend) — **the clean-machine install checklist** (below), including
   the honest "unsigned build" caveat.
5. `.github/workflows/ci.yml` — add a `package` job (needs: `core`, `native-windows` /
   `native-macos`) that runs `package:win` / `package:mac` and asserts the installer artifact
   exists and is non-trivially sized (a crude but real check against "packaging silently
   produced an empty/broken installer"). Does NOT need to install/run it — that's the
   manual clean-machine smoke test below, at least until a VM-based e2e install test is
   worth the investment (flag as a future task, not required now).

## Tests — WRITE FIRST where automatable
- **Native-addon-ships test (the most important one):** after `package:win` (or `:mac`),
  unpack the produced installer/asar and assert the compiled `.node` file is present in the
  unpacked output. This is the automated version of "did we actually ship the addon or
  silently degrade to mock" — write it as a real assertion, not a manual glance.
- **Config sanity:** a small script/test that loads `electron-builder.yml` and asserts the
  required keys are present (`asarUnpack` includes `*.node`, `appId` set, icons resolve to
  real files on disk) — catches a bad config edit before a multi-minute package build proves
  it broken.
- **Version/appId consistency:** assert `package.json` version matches what electron-builder
  will stamp into the installer (prevents a stale-version ship).

## Clean-machine smoke test (manual — this is the real DoD, same philosophy as 1.4's overlay smoke)
On a machine that has **never** had this repo, Node, or the dev toolchain on it (a fresh VM
or a borrowed machine is ideal — your dev laptop having VS Build Tools installed doesn't
prove a clean install works):
- [ ] Installer runs; **note whether the "Unknown Publisher" warning appears** (expected,
      unsigned — confirm it's not scarier than expected, e.g. not flagged as
      malware/blocked outright by Defender SmartScreen's reputation heuristics).
- [ ] App installs and launches without any dev dependency (no Node, no VS Build Tools
      present on this machine).
- [ ] Overlay + panel both appear correctly (transparent, click-through overlay; focusable
      panel) — proves the renderer bundle is genuinely self-contained.
- [ ] **The native addon actually works**, not silently degraded: move the real cursor via
      a guided task and confirm it moves — this is the test that catches the ASAR-unpack
      misconfiguration class of bug.
- [ ] Kill-switch hotkey halts a real in-flight action in the packaged app.
- [ ] Tray icon present, correctly tinted, "Quit" works.
- [ ] Uninstall works cleanly (no orphaned tray icon, no orphaned process — check Task
      Manager after uninstall).

## Definition of done
- [ ] `electron-builder.yml` complete; native addon confirmed present in the unpacked output
      (automated test, not just visual).
- [ ] ASAR integrity digest enabled (verified against the installed electron-builder
      version's actual mechanism, not assumed).
- [ ] `package:win` / `package:mac` scripts produce installers; CI `package` job asserts
      artifact existence + size.
- [ ] Clean-machine smoke test passed on Windows (macOS once 2.1 lands the native addon
      there — packaging can proceed for Windows now without waiting).
- [ ] Code signing status **explicitly documented** in `docs/demo-P1.md` (unsigned for P1;
      real cert is a Kyle-only open item, not silently deferred).
- [ ] `npm run verify` + `npm run test:e2e` still green; CI green including the new
      `package` job.
- [ ] Commit: `feat(click-click): packaging (electron-builder, asar integrity) [P1]`.

## Guardrails
- **Never let "it builds" substitute for "it runs on a clean machine."** The ASAR-unpack
  failure mode is silent by design (mock fallback swallows it gracefully, which is correct
  *runtime* behavior but means packaging can be broken and nothing screams about it) — the
  automated native-addon-ships test plus the manual clean-machine check are both required,
  not either/or.
- **State the code-signing trade-off; don't bury it.** An unsigned P1 build is a legitimate
  scope call. Presenting it as fully "done" without the caveat is not.
- If a proper fix takes ≤10 minutes, do it — no workarounds, including in build config
  where a quick "just disable asarUnpack checking" instinct would reintroduce the exact
  silent-failure class this project has spent two slices eliminating.

## Open items (Kyle-only, don't block on these)
- Windows code-signing certificate (EV/OV) — needed to remove the SmartScreen warning.
- Apple Developer Program membership + notarization — needed for macOS Gatekeeper to allow
  the `.dmg` without a manual override. Blocks a *fully smooth* macOS install; does not
  block Windows packaging or the P1 milestone.
