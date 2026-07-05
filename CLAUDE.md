# CLAUDE.md — Click Click

Read this first on `/prime`. Full plan: `specs/click-click.plan.md`.

## What this is
Click Click ("Everyone's 1st Agent") — a cross-platform (Windows + macOS) desktop
overlay buddy that **guides** (points + narrates), **assists** (confirm-gated
automation), and **reasons** via BYO-key LLM providers with consent-gated screen
context. Electron shell + per-OS native addons + a loopback AI gateway.

## The rules that are not negotiable (plan §6/§7)
1. **Confirmation-always.** Every automation action (click/keys/focus/browser)
   requires explicit per-action user confirmation — *including* actions requested
   via MCP tool calls. No "trusted" origins. The renderer can only approve/deny a
   main-issued `proposalId`; it can never submit a raw action payload.
2. **Critical ToS Gate.** Every provider flagged in the Provider Matrix is gated at
   the gateway before any upstream call. 100% quiz threshold. A pass is consent to a
   *specific ToS version* — a version bump expires all passes and disables the key.
3. **Aggregator rule.** An OpenAI model via OpenRouter needs *both* gates. See
   `gateway/providers/registry.ts` → `requiredGates()`.
4. **Loopback only.** Gateway + MCP servers bind `127.0.0.1` and require the
   per-launch bearer token on every request.
5. **No OpenAI internal dependency.** We never build *with* it; users may BYO-key
   through the gate.
6. **Keys never transit Motion Activated infra.** Keychain-only, never logged,
   direct-to-provider from the user's machine.
7. **No workaround if a proper fix takes ≤10 minutes.**

## Architecture in one breath
Overlay *visualizes only*. Panel *confirms only*. **Only main injects input, and
only after confirmation.** Contracts live once in `specs/click-click.plan.md` FS-A
and in `app/**` / `gateway/**`; zod schemas (`app/ipc/schemas.ts`) are the runtime
enforcement layer at every trust boundary.

## The green core (already built + tested — start from here)
Electron-free, 100%-covered where it's security-critical:
- `gateway/policy/critical-tos-gate.ts` — gate logic + version invalidation
- `gateway/auth.ts` — per-launch bearer token
- `gateway/providers/registry.ts` — provider resolution + aggregator rule
- `app/ipc/schemas.ts` — zod trust-boundary validation
- `app/platform/mock.ts` — mock bridge (unblocks all UI/gateway work)
- `app/engine/commands.ts` — Command Router
- `app/tasks/registry.ts` — 3 scripted tasks

## Commands
- `npm run verify` — typecheck + lint + test (run before every commit)
- `npm test` / `npm run test:cov` — vitest
- `npm run typecheck` / `npm run lint`

## Build order (plan §8)
Phase 1 (Windows MVP) slices 1.1→1.9. Do not advance a slice on red. Tests-first on
all security-critical code (gate, auth, sandbox, IPC schemas, proposal flow).
Deps (electron, ws, ps-list, puppeteer-core) are added at the slice that first needs
them — the core stays runnable in CI without a display server.
