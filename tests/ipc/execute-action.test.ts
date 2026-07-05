// tests/ipc/execute-action.test.ts

import { describe, it, expect } from 'vitest';
import { createMockBridge } from '../../app/platform/mock.js';
import { executeAction, InvalidActionError } from '../../app/ipc/execute-action.js';
import type { ProposedAction } from '../../app/models/types.js';
import type { DisplayBounds } from '../../app/overlay/render-model.js';

const DISPLAYS: DisplayBounds[] = [{ id: 0, x: 0, y: 0, width: 1920, height: 1080 }];

describe('executeAction — keys', () => {
  it('sends the whitelisted key sequence to the bridge', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'keys', keys: ['CTRL', 'ALT', 'ESC'], description: 'kill switch' };
    executeAction(bridge, action);
    expect(bridge.calls).toEqual([{ fn: 'sendKeys', args: [['CTRL', 'ALT', 'ESC']], at: expect.any(Number) }]);
  });

  it('throws (and never calls the bridge) when keys is missing', () => {
    const bridge = createMockBridge();
    const action = { actionType: 'keys', description: 'x' } as unknown as ProposedAction;
    expect(() => executeAction(bridge, action)).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });

  it('throws (and never calls the bridge) when keys is empty', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'keys', keys: [], description: 'x' };
    expect(() => executeAction(bridge, action)).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });

  it('defense-in-depth: a disallowed key token is rejected even though the proposal schema should have caught it', () => {
    const bridge = createMockBridge();
    const action = { actionType: 'keys', keys: ['DROP TABLE'], description: 'x' } as unknown as ProposedAction;
    expect(() => executeAction(bridge, action)).toThrow();
    expect(bridge.calls).toHaveLength(0);
  });
});

describe('executeAction — click', () => {
  it('moves the cursor then clicks at the point', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'click', point: { x: 10, y: 20 }, clickType: 'left', description: 'x' };
    executeAction(bridge, action, { displays: DISPLAYS });
    expect(bridge.calls.map((c) => c.fn)).toEqual(['moveCursor', 'click']);
    expect(bridge.calls[0]!.args).toEqual([{ x: 10, y: 20 }]);
    expect(bridge.calls[1]!.args).toEqual(['left']);
  });

  it('defaults clickType to left when omitted', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'click', point: { x: 1, y: 1 }, description: 'x' };
    executeAction(bridge, action, { displays: DISPLAYS });
    expect(bridge.calls[1]!.args).toEqual(['left']);
  });

  it('throws (and never calls the bridge) when point is missing', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'click', description: 'x' };
    expect(() => executeAction(bridge, action)).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });

  it('defense-in-depth: a point outside every known display is rejected', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'click', point: { x: 9999, y: 9999 }, description: 'x' };
    expect(() => executeAction(bridge, action, { displays: DISPLAYS })).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });

  it('skips the bounds check when no displays are provided (permissive default)', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'click', point: { x: 9999, y: 9999 }, description: 'x' };
    expect(() => executeAction(bridge, action)).not.toThrow();
    expect(bridge.calls).toHaveLength(2);
  });
});

describe('executeAction — focus', () => {
  it('focuses the target window', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'focus', targetWindowTitle: 'Settings', description: 'x' };
    executeAction(bridge, action);
    expect(bridge.calls).toEqual([{ fn: 'focusWindow', args: ['Settings'], at: expect.any(Number) }]);
  });

  it('throws (and never calls the bridge) when targetWindowTitle is missing', () => {
    const bridge = createMockBridge();
    const action: ProposedAction = { actionType: 'focus', description: 'x' };
    expect(() => executeAction(bridge, action)).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });
});

describe('executeAction — unknown actionType', () => {
  it('throws for an actionType outside the known three (defense in depth)', () => {
    const bridge = createMockBridge();
    const action = { actionType: 'delete-everything', description: 'x' } as unknown as ProposedAction;
    expect(() => executeAction(bridge, action)).toThrow(InvalidActionError);
    expect(bridge.calls).toHaveLength(0);
  });
});
