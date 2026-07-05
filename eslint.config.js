// Flat config (ESLint 9). Security-leaning rules on top of the TS recommended set.
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'node_modules/**',
      'app/platform/native/**',
      '**/*.html',
      '**/*.css',
      'coverage/**',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      // Hard rules from the plan, enforced by lint:
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'eqeqeq': ['error', 'always'],
    },
  },
  {
    // tsconfig.json's `lib` includes DOM (needed so app/overlay + app/panel
    // typecheck) even though it's a single project-wide config — that makes
    // DOM globals *visible* to Node-only code (gateway/**, app/main.ts,
    // app/preload.ts, mcp-servers/**) without erroring. This block closes that
    // leak at lint time: any of these files that actually reference a DOM
    // global fails lint, without the project-references build surgery a real
    // tsconfig split would need. Renderer files (and their jsdom tests) are
    // exempted below since DOM globals are exactly what they're for. e2e/**
    // is exempted too: window/document inside a page.evaluate() callback is
    // serialized and runs IN the renderer, not in the Node test-runner process.
    files: ['**/*.ts'],
    ignores: [
      'node_modules/**',
      'app/platform/native/**',
      'app/overlay/**',
      'app/panel/**',
      'tests/overlay/**',
      'tests/panel/**',
      'e2e/**',
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'document',
          'window',
          'navigator',
          'localStorage',
          'sessionStorage',
          'alert',
          'confirm',
          'prompt',
        ].map((name) => ({
          name,
          message:
            `'${name}' is a DOM global — this file runs in main/gateway/Node, ` +
            'not a renderer. If this is genuinely renderer code, move it under ' +
            'app/overlay/** or app/panel/**.',
        })),
      ],
    },
  },
];
