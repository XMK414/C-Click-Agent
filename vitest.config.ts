import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      // Coverage Map from plan §9. Security-critical modules must hit 100%.
      include: [
        'app/platform/mock.ts',
        'app/ipc/schemas.ts',
        'app/engine/commands.ts',
        'app/tasks/registry.ts',
        'gateway/auth.ts',
        'gateway/policy/critical-tos-gate.ts',
        'gateway/providers/registry.ts',
        // Slice 1.6
        'gateway/policy/pass-store.ts',
        'gateway/providers/openrouter.ts',
        'gateway/server.ts',
        // Slice 1.4 — pure logic only; Electron main/preload are validated via
        // docs/demo-P1.md, per the plan's Electron-free-core rule.
        'app/overlay/render-model.ts',
        'app/overlay/cursor-mirror.ts',
        'app/overlay/overlay.ts',
        // Slice 1.5 — pure logic only; panel.ts (DOM glue) + main/preload wiring
        // are validated via docs/demo-P1.md, per the plan's Electron-free-core rule.
        'app/panel/panel-state.ts',
        'app/panel/gate-view.ts',
      ],
      thresholds: {
        // Green-core gate. Raise UI/bridge-wrapper thresholds as those land (§9).
        'gateway/policy/critical-tos-gate.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'gateway/auth.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
        'app/ipc/schemas.ts': { statements: 100, branches: 90, functions: 100, lines: 100 },
        'gateway/policy/pass-store.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'gateway/providers/openrouter.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'gateway/server.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'app/overlay/render-model.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'app/overlay/cursor-mirror.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'app/panel/panel-state.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
        'app/panel/gate-view.ts': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
