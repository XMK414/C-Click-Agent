// @vitest-environment jsdom
// tests/panel/panel.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initPanel, type PanelBridge, type ProviderInfo, type GateStatusResult, type QuizResponse } from '../../app/panel/panel.js';
import type { SubmitResult } from '../../app/panel/gate-view.js';
import type { PanelState } from '../../app/panel/panel-state.js';

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setupDom(): void {
  document.body.innerHTML = `
    <div id="strip"></div>
    <section id="panel" hidden>
      <select id="provider"></select>
      <div id="gate-container"></div>
      <input id="prompt" type="text" />
      <input id="provider-key" type="password" />
      <ul id="recent"></ul>
    </section>
  `;
}

function makeBridge(overrides: Partial<PanelBridge> = {}): PanelBridge {
  const defaults: PanelBridge = {
    getProviders: async (): Promise<ProviderInfo[]> => [
      { id: 'openrouter', name: 'OpenRouter' },
      { id: 'openai', name: 'OpenAI (BYO key)' },
    ],
    getGateStatus: async (): Promise<GateStatusResult> => ({ unlocked: true }),
    getQuiz: async (): Promise<QuizResponse> => ({
      warning: 'be careful',
      detailsUrl: 'https://example.test/breakdown',
      questions: [{ id: 'q1', topic: 't1', prompt: 'Prompt?', options: ['a', 'b'] }],
    }),
    submitQuiz: async (): Promise<SubmitResult> => ({ unlocked: true }),
    askAgent: async (): Promise<unknown> => ({ steps: [], mode: 'guide' }),
    onPanelState: (_cb: (state: PanelState) => void): void => {},
  };
  return { ...defaults, ...overrides };
}

beforeEach(() => {
  setupDom();
});

describe('initPanel — provider select', () => {
  it('populates the provider <select> from the bridge, via textContent only', async () => {
    const bridge = makeBridge();
    initPanel(bridge, document);
    await flushAsync();

    const select = document.getElementById('provider') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0]!.value).toBe('openrouter');
    expect(select.options[0]!.textContent).toBe('OpenRouter');
  });
});

describe('initPanel — hover expand/collapse', () => {
  it('expands the panel on strip hover', () => {
    const bridge = makeBridge();
    initPanel(bridge, document);

    document.getElementById('strip')!.dispatchEvent(new Event('mouseenter'));
    expect((document.getElementById('panel') as HTMLElement).hidden).toBe(false);
  });

  it('collapses the panel when the mouse leaves', () => {
    const bridge = makeBridge();
    initPanel(bridge, document);

    document.getElementById('strip')!.dispatchEvent(new Event('mouseenter'));
    document.getElementById('panel')!.dispatchEvent(new Event('mouseleave'));
    expect((document.getElementById('panel') as HTMLElement).hidden).toBe(true);
  });
});

describe('initPanel — gate quiz flow', () => {
  it('renders a malicious warning/prompt as literal text, never as HTML', async () => {
    const bridge = makeBridge({
      getGateStatus: async () => ({ unlocked: false, reason: 'no_pass' }),
      getQuiz: async () => ({
        warning: '<img src=x onerror=alert(1)>',
        detailsUrl: 'https://example.test/breakdown',
        questions: [{ id: 'q1', topic: 't1', prompt: '<script>alert(2)</script>', options: ['<b>opt</b>'] }],
      }),
    });
    initPanel(bridge, document);
    await flushAsync();

    (document.getElementById('provider') as HTMLSelectElement).value = 'openrouter';
    const prompt = document.getElementById('prompt') as HTMLInputElement;
    prompt.value = 'help me';
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    const container = document.getElementById('gate-container')!;
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.textContent).toContain('<script>alert(2)</script>');
  });

  it('submitting the quiz calls submitQuiz and never renders/transmits a correctIndex', async () => {
    let submittedAnswers: Record<string, number> | undefined;
    const bridge = makeBridge({
      getGateStatus: async () => ({ unlocked: false }),
      submitQuiz: async (_provider, answers) => {
        submittedAnswers = answers;
        expect(JSON.stringify(answers)).not.toContain('correctIndex');
        return { unlocked: false, missedTopics: ['t1'] };
      },
    });
    initPanel(bridge, document);
    await flushAsync();

    (document.getElementById('provider') as HTMLSelectElement).value = 'openrouter';
    const prompt = document.getElementById('prompt') as HTMLInputElement;
    prompt.value = 'help me';
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    const container = document.getElementById('gate-container')!;
    const radio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushAsync();

    expect(submittedAnswers).toEqual({ q1: 0 });
    expect(container.textContent).toContain('t1');
    expect(container.textContent).not.toContain('correctIndex');
    expect(container.querySelector('button')?.textContent).toBe('Retake');
  });

  it('a passing submission shows the unlocked view', async () => {
    const bridge = makeBridge({
      getGateStatus: async () => ({ unlocked: false }),
      submitQuiz: async () => ({ unlocked: true }),
    });
    initPanel(bridge, document);
    await flushAsync();

    (document.getElementById('provider') as HTMLSelectElement).value = 'openrouter';
    const prompt = document.getElementById('prompt') as HTMLInputElement;
    prompt.value = 'help me';
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    const container = document.getElementById('gate-container')!;
    const form = container.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushAsync();

    expect(container.textContent).toBe('Unlocked.');
  });
});

describe('initPanel — ask flow (gate already open)', () => {
  it('calls askAgent with the prompt/provider/key and records a recent entry', async () => {
    const askAgent = vi.fn(async () => ({ steps: [], mode: 'guide' as const }));
    const bridge = makeBridge({ getGateStatus: async () => ({ unlocked: true }), askAgent });
    initPanel(bridge, document);
    await flushAsync();

    (document.getElementById('provider') as HTMLSelectElement).value = 'openrouter';
    const prompt = document.getElementById('prompt') as HTMLInputElement;
    const keyInput = document.getElementById('provider-key') as HTMLInputElement;
    prompt.value = 'help me';
    keyInput.value = 'sk-test';
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    expect(askAgent).toHaveBeenCalledWith('help me', 'openrouter', 'sk-test');
    expect(document.getElementById('recent')!.textContent).toContain('help me');
    // The key input is cleared immediately after use — never retained.
    expect(keyInput.value).toBe('');
  });

  it('does nothing if the prompt or key is empty', async () => {
    const askAgent = vi.fn(async () => ({ steps: [], mode: 'guide' as const }));
    const bridge = makeBridge({ getGateStatus: async () => ({ unlocked: true }), askAgent });
    initPanel(bridge, document);
    await flushAsync();

    (document.getElementById('provider') as HTMLSelectElement).value = 'openrouter';
    const prompt = document.getElementById('prompt') as HTMLInputElement;
    prompt.value = '';
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flushAsync();

    expect(askAgent).not.toHaveBeenCalled();
  });
});

describe('initPanel — onPanelState wiring', () => {
  it('registers a listener that drives the local state machine', () => {
    let captured: ((state: PanelState) => void) | undefined;
    const bridge = makeBridge({
      onPanelState: (cb) => {
        captured = cb;
      },
    });
    initPanel(bridge, document);
    expect(captured).toBeTypeOf('function');
    // Driving it directly must not throw, even for a transition that's a no-op.
    expect(() => captured!('Replying')).not.toThrow();
  });
});

describe('initPanel — missing DOM elements', () => {
  it('does nothing (no throw) when expected elements are absent', () => {
    document.body.innerHTML = '';
    expect(() => initPanel(makeBridge(), document)).not.toThrow();
  });
});
