// tests/tasks/registry.test.ts

import { describe, it, expect } from 'vitest';
import { TASKS, getTask, tasksForPlatform } from '../../app/tasks/registry.js';
import { ALLOWED_KEY_TOKENS } from '../../app/platform/key-tokens.js';

describe('task registry', () => {
  it('ships at least 3 tasks (DoD Phase 1)', () => {
    expect(TASKS.length).toBeGreaterThanOrEqual(3);
  });

  it('every keys step uses only whitelisted tokens', () => {
    for (const task of TASKS) {
      for (const step of task.steps) {
        if (step.actionType === 'keys') {
          expect(step.keys, `${task.id}/${step.id}`).toBeDefined();
          for (const tok of step.keys ?? []) {
            expect(ALLOWED_KEY_TOKENS.has(tok), `${task.id}/${step.id}: ${tok}`).toBe(true);
          }
        }
      }
    }
  });

  it('every step has a non-empty id and text', () => {
    for (const task of TASKS) {
      for (const step of task.steps) {
        expect(step.id.length).toBeGreaterThan(0);
        expect(step.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('getTask + tasksForPlatform filter correctly', () => {
    expect(getTask('open-task-manager')?.platform).toBe('windows');
    expect(tasksForPlatform('macos').every((t) => t.platform === 'macos' || t.platform === 'both')).toBe(true);
  });
});
