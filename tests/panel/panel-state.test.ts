// tests/panel/panel-state.test.ts

import { describe, it, expect } from 'vitest';
import { canTransition, createPanelStateMachine } from '../../app/panel/panel-state.js';

describe('canTransition', () => {
  it('allows each documented valid transition', () => {
    expect(canTransition('Collapsed', 'Expanded')).toBe(true);
    expect(canTransition('Expanded', 'Processing')).toBe(true);
    expect(canTransition('Expanded', 'Collapsed')).toBe(true);
    expect(canTransition('Processing', 'Replying')).toBe(true);
    expect(canTransition('Replying', 'Collapsed')).toBe(true);
  });

  it('rejects a disallowed transition, e.g. Collapsed -> Replying', () => {
    expect(canTransition('Collapsed', 'Replying')).toBe(false);
    expect(canTransition('Collapsed', 'Processing')).toBe(false);
    expect(canTransition('Processing', 'Collapsed')).toBe(false);
    expect(canTransition('Processing', 'Expanded')).toBe(false);
    expect(canTransition('Replying', 'Expanded')).toBe(false);
    expect(canTransition('Replying', 'Processing')).toBe(false);
    expect(canTransition('Expanded', 'Replying')).toBe(false);
  });
});

describe('createPanelStateMachine', () => {
  it('starts Collapsed by default', () => {
    const m = createPanelStateMachine();
    expect(m.state).toBe('Collapsed');
  });

  it('applies a valid transition and updates state', () => {
    const m = createPanelStateMachine();
    expect(m.transition('Expanded')).toBe(true);
    expect(m.state).toBe('Expanded');
  });

  it('rejects an invalid transition as a no-op — state is unchanged', () => {
    const m = createPanelStateMachine();
    expect(m.transition('Replying')).toBe(false);
    expect(m.state).toBe('Collapsed');
  });

  it('walks the full documented cycle back to Collapsed', () => {
    const m = createPanelStateMachine();
    expect(m.transition('Expanded')).toBe(true);
    expect(m.transition('Processing')).toBe(true);
    expect(m.transition('Replying')).toBe(true);
    expect(m.transition('Collapsed')).toBe(true);
    expect(m.state).toBe('Collapsed');
  });

  it('can collapse directly from Expanded without going through Processing', () => {
    const m = createPanelStateMachine();
    m.transition('Expanded');
    expect(m.transition('Collapsed')).toBe(true);
  });
});
