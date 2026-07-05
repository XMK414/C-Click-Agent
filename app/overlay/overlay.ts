// app/overlay/overlay.ts — visualize ONLY. Slice 1.4.
//
// Receives CURSOR_POS_UPDATE + a pre-built RenderModel (GUIDANCE_UPDATE) via the
// preload bridge. Renders step text with `textContent` only — never `innerHTML`
// (the prompt-injection backstop for screen/DOM-sourced text, plan §7). Never
// injects input; only main does, and only post-confirmation (that path is 1.5+).

import type { RenderModel, RenderStep } from './render-model.js';

export interface CursorPosLike {
  x: number;
  y: number;
  display?: number;
}

export interface OverlayBridge {
  onCursor(cb: (pos: CursorPosLike) => void): void;
  onGuidance(cb: (model: RenderModel) => void): void;
  onState(cb: (state: string) => void): void;
}

declare global {
  interface Window {
    clickclick: OverlayBridge;
  }
}

function renderStep(doc: Document, step: RenderStep): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'cc-step';
  el.textContent = step.text; // textContent ONLY — never innerHTML
  return el;
}

function renderSteps(doc: Document, container: HTMLElement, model: RenderModel): void {
  container.textContent = ''; // clears prior children safely (no innerHTML)
  for (const step of model.steps) {
    container.appendChild(renderStep(doc, step));
  }
}

/**
 * Wire the overlay DOM to the preload bridge. Exposed (rather than only run as a
 * side effect) so tests can call it directly with an injected bridge + document,
 * with no reliance on module-load ordering or globals.
 */
export function initOverlay(bridge: OverlayBridge, doc: Document): void {
  const buddy = doc.getElementById('buddy-cursor');
  const stepsContainer = doc.getElementById('steps-container');
  if (!buddy || !stepsContainer) return;

  bridge.onCursor((pos) => {
    buddy.style.transform = 'translate(' + String(pos.x) + 'px, ' + String(pos.y) + 'px)';
  });

  bridge.onGuidance((model) => {
    renderSteps(doc, stepsContainer, model);
  });

  bridge.onState((state) => {
    buddy.dataset.state = state;
  });
}

// Production bootstrap: preload always exposes `window.clickclick` before this
// module evaluates, so this is safe. Guarded so importing the module under a
// bridge-less test environment (jsdom, no preload) never throws.
if (typeof window !== 'undefined' && window.clickclick) {
  initOverlay(window.clickclick, document);
}
