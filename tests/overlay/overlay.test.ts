// @vitest-environment jsdom
// tests/overlay/overlay.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { initOverlay, type OverlayBridge } from '../../app/overlay/overlay.js';
import type { RenderModel } from '../../app/overlay/render-model.js';

function makeBridge(): OverlayBridge & {
  fireCursor: (pos: { x: number; y: number }) => void;
  fireGuidance: (model: RenderModel) => void;
  fireState: (state: string) => void;
} {
  let cursorCb: ((pos: { x: number; y: number }) => void) | undefined;
  let guidanceCb: ((model: RenderModel) => void) | undefined;
  let stateCb: ((state: string) => void) | undefined;
  return {
    onCursor: (cb) => {
      cursorCb = cb;
    },
    onGuidance: (cb) => {
      guidanceCb = cb;
    },
    onState: (cb) => {
      stateCb = cb;
    },
    fireCursor: (pos) => cursorCb?.(pos),
    fireGuidance: (model) => guidanceCb?.(model),
    fireState: (state) => stateCb?.(state),
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="buddy-cursor"></div><div id="steps-container"></div>';
});

describe('initOverlay', () => {
  it('positions the buddy cursor via transform on cursor updates', () => {
    const bridge = makeBridge();
    initOverlay(bridge, document);
    bridge.fireCursor({ x: 12, y: 34 });
    expect(document.getElementById('buddy-cursor')!.style.transform).toBe('translate(12px, 34px)');
  });

  it('applies data-state to #buddy-cursor on state updates', () => {
    const bridge = makeBridge();
    initOverlay(bridge, document);
    bridge.fireState('listening');
    expect(document.getElementById('buddy-cursor')!.dataset.state).toBe('listening');
  });

  it('renders step text as literal text — never as HTML (injection backstop)', () => {
    const bridge = makeBridge();
    initOverlay(bridge, document);
    bridge.fireGuidance({
      mode: 'guide',
      steps: [{ text: '<img src=x onerror=alert(1)>', available: false }],
    });

    const container = document.getElementById('steps-container')!;
    expect(container.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });

  it('clears previously rendered steps on the next guidance update', () => {
    const bridge = makeBridge();
    initOverlay(bridge, document);
    bridge.fireGuidance({ mode: 'guide', steps: [{ text: 'first', available: false }] });
    bridge.fireGuidance({ mode: 'guide', steps: [{ text: 'second', available: false }] });

    const container = document.getElementById('steps-container')!;
    expect(container.textContent).toBe('second');
    expect(container.children).toHaveLength(1);
  });

  it('does nothing (no throw) when the expected DOM elements are missing', () => {
    document.body.innerHTML = '';
    const bridge = makeBridge();
    expect(() => initOverlay(bridge, document)).not.toThrow();
  });
});
