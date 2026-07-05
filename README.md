# Click Click — Everyone's 1st Agent

A cross-platform desktop **screen buddy**: a transparent, always-on-top overlay
that mirrors your cursor, points at UI elements and narrates steps (**guide**),
optionally performs confirm-gated actions (**assist**), and reasons via your own
BYO-key LLM providers with consent-gated screen context.

> Status: **Phase 1 scaffold.** The security-critical core is implemented and
> tested; the Electron shell, native addons, gateway server, and MCP servers are
> scaffolded with per-slice TODOs. See `specs/click-click.plan.md` for the full plan.

## Quickstart
```bash
npm install
npm run verify   # typecheck + lint + test  (all green on a clean checkout)
```

## What's green right now (built + tested)
Runs in CI without a display server — the core is deliberately Electron-free.

| Module | What it does | Coverage |
|---|---|---|
| `gateway/policy/critical-tos-gate.ts` | ToS gate: 100% grading, pass records, **version invalidation** | 100% |
| `gateway/auth.ts` | Per-launch bearer token for loopback services | 100% |
| `gateway/providers/registry.ts` | Provider resolution + **aggregator rule** (OpenAI-via-OpenRouter) | 100% |
| `app/ipc/schemas.ts` | zod validation at every trust boundary | 100% |
| `app/platform/mock.ts` | Mock bridge — unblocks all UI/gateway work | 95% |
| `app/engine/commands.ts` | Command Router: allowlist + per-source rate limiting | 100% |
| `app/tasks/registry.ts` | 3 scripted guided tasks | 100% |

`npm test` → **55 tests passing.**

## What's scaffolded (structured, with TODOs, not yet implemented)
Electron main/preload/handlers · overlay + panel UI · Windows/macOS native addons
(`binding.gyp` + `.cpp`/`.mm`) · gateway Express server + provider adapters + signed
ToS-manifest client · MCP client + fs/system/browser servers · voice/animation (P4).

Each stub names the slice that implements it and the security rules it must honor.

## The non-negotiables (see `CLAUDE.md`)
Confirmation-always (incl. MCP) · Critical ToS Gate at 100% with version binding ·
aggregator gate rule · loopback-only + bearer token · keys never leave your machine ·
no internal OpenAI dependency.

## Repo layout
```
app/        Electron app: overlay, panel, platform bridges, tasks, models, engine, ipc, mcp
gateway/    Loopback AI gateway: providers, ToS-gate policy, prompts
mcp-servers/ Local MCP servers (fs/system read-only; browser action-class, P4)
specs/      click-click.plan.md — the source of truth
tests/      Mirrors app/ and gateway/ 1:1
```

## License
Proprietary — Motion Activated.
