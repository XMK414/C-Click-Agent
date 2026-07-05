// app/tasks/types.ts — canonical task schema (plan FS-A).

import type { ClickType } from '../platform/index.js';

export type TaskId =
  | 'change-audio-output'
  | 'clear-browser-cache'
  | 'open-task-manager'
  | 'open-activity-monitor';

export interface TaskStepPoint {
  x: number;
  y: number;
  display?: number;
}

export interface TaskStep {
  id: string;
  text: string; // "Open Settings"
  hint?: string; // "Click the gear icon"
  point?: TaskStepPoint;
  actionType?: 'keys' | 'click' | 'focus' | 'none';
  keys?: string[];
  clickType?: ClickType;
  targetWindowTitle?: string;
}

export interface TaskDefinition {
  id: TaskId;
  goal: string;
  platform: 'windows' | 'macos' | 'both';
  steps: TaskStep[];
}
