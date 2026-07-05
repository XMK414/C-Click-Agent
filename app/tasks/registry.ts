// app/tasks/registry.ts
//
// Scripted guided workflows (plan slice 1.7). Three at launch. These are the
// deterministic, no-LLM-needed paths that prove the overlay + step rendering
// work end-to-end on the mock bridge before any provider is wired.

import type { TaskDefinition, TaskId } from './types.js';

export const TASKS: readonly TaskDefinition[] = [
  {
    id: 'change-audio-output',
    goal: 'Change the default audio output device',
    platform: 'windows',
    steps: [
      { id: 'open-settings', text: 'Open Settings', actionType: 'keys', keys: ['WIN', 'I'] },
      { id: 'click-system', text: "Click 'System'", hint: 'Top-left menu item', point: { x: 120, y: 160 }, actionType: 'none' },
      { id: 'click-sound', text: "Click 'Sound'", point: { x: 220, y: 260 }, actionType: 'none' },
    ],
  },
  {
    id: 'open-task-manager',
    goal: 'Open Task Manager',
    platform: 'windows',
    steps: [
      { id: 'press-ctrl-shift-esc', text: 'Press Ctrl+Shift+Esc to open Task Manager', actionType: 'keys', keys: ['CTRL', 'SHIFT', 'ESC'] },
    ],
  },
  {
    id: 'open-activity-monitor',
    goal: 'Open Activity Monitor',
    platform: 'macos',
    steps: [
      { id: 'open-spotlight', text: 'Open Spotlight search', actionType: 'keys', keys: ['CMD', 'SPACE'] },
      { id: 'type-activity-monitor', text: 'Type "Activity Monitor" and press Enter', actionType: 'none' },
    ],
  },
];

export function getTask(id: TaskId): TaskDefinition | undefined {
  return TASKS.find((t) => t.id === id);
}

export function tasksForPlatform(platform: 'windows' | 'macos'): TaskDefinition[] {
  return TASKS.filter((t) => t.platform === platform || t.platform === 'both');
}
