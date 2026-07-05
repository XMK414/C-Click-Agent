// tests/panel/confirm-view.test.ts

import { describe, it, expect } from 'vitest';
import { toConfirmView } from '../../app/panel/confirm-view.js';
import type { ProposedAction } from '../../app/models/types.js';

describe('toConfirmView', () => {
  it('summarizes a keys action concretely', () => {
    const action: ProposedAction = { actionType: 'keys', keys: ['CTRL', 'SHIFT', 'ESC'], description: 'Open Task Manager' };
    const view = toConfirmView('id-1', 'model', action);
    expect(view).toEqual({
      proposalId: 'id-1',
      origin: 'model',
      summary: 'Press CTRL+SHIFT+ESC',
      description: 'Open Task Manager',
    });
  });

  it('shows an empty key sequence gracefully for a keys action missing keys (defense in depth)', () => {
    const action = { actionType: 'keys', description: 'x' } as unknown as ProposedAction;
    expect(toConfirmView('id-1b', 'model', action).summary).toBe('Press ');
  });

  it('summarizes a click action with the concrete coordinates', () => {
    const action: ProposedAction = { actionType: 'click', point: { x: 120, y: 340 }, description: 'Click Save' };
    const view = toConfirmView('id-2', 'task', action);
    expect(view.summary).toBe('Click at (120, 340)');
  });

  it('shows "?" coordinates for a click action missing a point (defense in depth)', () => {
    const action = { actionType: 'click', description: 'x' } as unknown as ProposedAction;
    expect(toConfirmView('id-2b', 'model', action).summary).toBe('Click at (?, ?)');
  });

  it('omits the click-type prefix for an explicit left click', () => {
    const action: ProposedAction = { actionType: 'click', point: { x: 5, y: 6 }, clickType: 'left', description: 'x' };
    expect(toConfirmView('id-2c', 'model', action).summary).toBe('Click at (5, 6)');
  });

  it('includes the click type when it is not the default left click', () => {
    const action: ProposedAction = {
      actionType: 'click',
      point: { x: 1, y: 2 },
      clickType: 'right',
      description: 'Open context menu',
    };
    expect(toConfirmView('id-3', 'model', action).summary).toBe('right-click at (1, 2)');
  });

  it('summarizes a focus action with the target window title', () => {
    const action: ProposedAction = { actionType: 'focus', targetWindowTitle: 'Settings', description: 'Bring to front' };
    expect(toConfirmView('id-4', 'mcp', action).summary).toBe('Focus window "Settings"');
  });

  it('falls back to a labeled "unknown action" summary for an actionType outside the known three (defense in depth)', () => {
    const action = { actionType: 'delete-everything', description: 'x' } as unknown as ProposedAction;
    expect(toConfirmView('id-6', 'model', action).summary).toBe('Unknown action: delete-everything');
  });

  it('shows an empty title gracefully for a focus action missing targetWindowTitle (defense in depth)', () => {
    const action = { actionType: 'focus', description: 'x' } as unknown as ProposedAction;
    expect(toConfirmView('id-4b', 'model', action).summary).toBe('Focus window ""');
  });

  it('passes the description through verbatim, even if it looks like markup', () => {
    const action: ProposedAction = {
      actionType: 'focus',
      targetWindowTitle: 'Settings',
      description: '<img src=x onerror=alert(1)>',
    };
    const view = toConfirmView('id-5', 'model', action);
    expect(view.description).toBe('<img src=x onerror=alert(1)>');
  });
});
