// app/panel/panel.ts — panel state machine + confirmation UI. Slice 1.5.
//
// Collapsed strip <-> expanded panel, provider selection, the gate quiz flow,
// and asking the agent (guidance renders in the OVERLAY, not here — main
// mediates that). `textContent` ONLY for every gateway/model/gate string —
// never `innerHTML`. The bearer token and gateway URL never reach this file;
// only main's mediated IPC results do.

import { createPanelStateMachine, type PanelState } from './panel-state.js';
import { toQuizView, toResultView, type QuizView, type RedactedGateQuestion, type ResultView, type SubmitResult } from './gate-view.js';
import { toConfirmView, type ConfirmView } from './confirm-view.js';
import { automationProposalSchema, safeParse } from '../ipc/schemas.js';

export interface ProviderInfo {
  id: string;
  name: string;
}

export interface GateStatusResult {
  unlocked: boolean;
  reason?: string;
}

export interface QuizResponse {
  warning: string;
  detailsUrl: string;
  questions: RedactedGateQuestion[];
}

export interface PanelBridge {
  getProviders(): Promise<ProviderInfo[]>;
  askAgent(prompt: string, provider: string, providerKey: string): Promise<unknown>;
  getGateStatus(provider: string): Promise<GateStatusResult>;
  getQuiz(provider: string): Promise<QuizResponse>;
  submitQuiz(provider: string, answers: Record<string, number>): Promise<SubmitResult>;
  onPanelState(cb: (state: PanelState) => void): void;
  /** Raw, untrusted wire payload — validated here via automationProposalSchema before use. */
  onProposal(cb: (raw: unknown) => void): void;
  /** The ONLY shape the renderer can ever send back — never a raw action. */
  decide(proposalId: string, approved: boolean): void;
}

declare global {
  interface Window {
    clickclickPanel: PanelBridge;
  }
}

const AUTO_COLLAPSE_MS = 2500;
const MAX_RECENT = 10;

function clearChildren(el: HTMLElement): void {
  el.textContent = '';
}

function renderQuiz(container: HTMLElement, view: QuizView, onSubmit: (answers: Record<string, number>) => void): void {
  clearChildren(container);

  const warning = document.createElement('p');
  warning.className = 'cc-gate-warning';
  warning.textContent = view.warning;
  container.appendChild(warning);

  if (view.detailsUrl) {
    const link = document.createElement('a');
    link.className = 'cc-gate-details';
    link.textContent = 'Read the full breakdown';
    link.href = view.detailsUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    container.appendChild(link);
  }

  const form = document.createElement('form');
  form.className = 'cc-gate-quiz';
  const answers: Record<string, number> = {};

  for (const q of view.questions) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = q.prompt; // textContent only — never innerHTML
    fieldset.appendChild(legend);

    q.options.forEach((optionText, index) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = q.id;
      radio.value = String(index);
      radio.addEventListener('change', () => {
        answers[q.id] = index;
      });
      label.appendChild(radio);
      const span = document.createElement('span');
      span.textContent = optionText;
      label.appendChild(span);
      fieldset.appendChild(label);
    });

    form.appendChild(fieldset);
  }

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Submit';
  form.appendChild(submitBtn);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit(answers);
  });

  container.appendChild(form);
}

function renderResult(container: HTMLElement, view: ResultView, onRetake: () => void): void {
  clearChildren(container);

  if (view.kind === 'unlocked') {
    const ok = document.createElement('p');
    ok.className = 'cc-gate-unlocked';
    ok.textContent = 'Unlocked.';
    container.appendChild(ok);
    return;
  }

  const failed = document.createElement('p');
  failed.className = 'cc-gate-failed';
  failed.textContent = 'Not quite — missed: ' + view.missedTopics.join(', ');
  container.appendChild(failed);

  const retakeBtn = document.createElement('button');
  retakeBtn.type = 'button';
  retakeBtn.textContent = 'Retake';
  retakeBtn.addEventListener('click', onRetake);
  container.appendChild(retakeBtn);
}

function renderConfirm(container: HTMLElement, view: ConfirmView, onDecide: (approved: boolean) => void): void {
  clearChildren(container);
  container.hidden = false;

  const summary = document.createElement('p');
  summary.className = 'cc-confirm-summary';
  summary.textContent = view.summary; // the CONCRETE action — textContent only
  container.appendChild(summary);

  const description = document.createElement('p');
  description.className = 'cc-confirm-description';
  description.textContent = view.description;
  container.appendChild(description);

  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.textContent = 'Approve';
  approveBtn.addEventListener('click', () => onDecide(true));
  container.appendChild(approveBtn);

  const denyBtn = document.createElement('button');
  denyBtn.type = 'button';
  denyBtn.textContent = 'Deny';
  denyBtn.addEventListener('click', () => onDecide(false));
  container.appendChild(denyBtn);
}

function appendRecent(list: HTMLElement, text: string): void {
  const item = document.createElement('li');
  item.textContent = text; // textContent only
  list.prepend(item);
  while (list.children.length > MAX_RECENT) {
    list.lastElementChild?.remove();
  }
}

/**
 * Wire the panel DOM to the preload bridge. Exposed (rather than only run as a
 * side effect) so tests can call it directly with an injected bridge + document.
 */
export function initPanel(bridge: PanelBridge, doc: Document): void {
  const strip = doc.getElementById('strip');
  const panel = doc.getElementById('panel');
  const providerSelect = doc.getElementById('provider') as HTMLSelectElement | null;
  const gateContainer = doc.getElementById('gate-container');
  const promptInput = doc.getElementById('prompt') as HTMLInputElement | null;
  const providerKeyInput = doc.getElementById('provider-key') as HTMLInputElement | null;
  const recentList = doc.getElementById('recent');
  const confirmContainer = doc.getElementById('confirm');
  if (
    !strip ||
    !panel ||
    !providerSelect ||
    !gateContainer ||
    !promptInput ||
    !providerKeyInput ||
    !recentList ||
    !confirmContainer
  ) {
    return;
  }

  const machine = createPanelStateMachine();
  let autoCollapseTimer: ReturnType<typeof setTimeout> | null = null;

  function expand(): void {
    if (machine.transition('Expanded')) {
      panel!.hidden = false;
      promptInput!.focus();
    }
  }

  function collapse(): void {
    if (machine.state === 'Expanded' || machine.state === 'Replying') {
      if (machine.transition('Collapsed')) {
        panel!.hidden = true;
      }
    }
  }

  strip.addEventListener('mouseenter', expand);
  panel.addEventListener('mouseleave', () => {
    if (machine.state === 'Expanded') collapse();
  });

  bridge.onPanelState((state) => {
    machine.transition(state);
  });

  bridge.onProposal((raw) => {
    const parsed = safeParse(automationProposalSchema, raw);
    if (!parsed.ok) return; // malformed/untrusted proposal — drop silently, never shown
    // A confirmation needs the user's attention now — force the panel visible
    // regardless of hover state (best-effort state-machine sync; visibility
    // itself never depends on whether the transition was "valid").
    machine.transition('Expanded');
    panel!.hidden = false;
    const view = toConfirmView(parsed.value.proposalId, parsed.value.origin, parsed.value.action);
    renderConfirm(confirmContainer!, view, (approved) => {
      bridge.decide(view.proposalId, approved);
      confirmContainer!.hidden = true;
      clearChildren(confirmContainer!);
    });
  });

  async function loadProviders(): Promise<void> {
    const providers = await bridge.getProviders();
    clearChildren(providerSelect!);
    for (const p of providers) {
      const option = doc.createElement('option');
      option.value = p.id;
      option.textContent = p.name; // textContent only
      providerSelect!.appendChild(option);
    }
  }
  void loadProviders();

  async function showQuiz(provider: string): Promise<void> {
    const quiz = await bridge.getQuiz(provider);
    const view = toQuizView(quiz.warning, quiz.questions, quiz.detailsUrl);
    renderQuiz(gateContainer!, view, (answers) => void handleSubmit(provider, answers));
  }

  async function handleSubmit(provider: string, answers: Record<string, number>): Promise<void> {
    const result = await bridge.submitQuiz(provider, answers);
    const view = toResultView(result);
    renderResult(gateContainer!, view, () => void showQuiz(provider));
  }

  async function handleAsk(): Promise<void> {
    const provider = providerSelect!.value;
    if (!provider) return;

    const status = await bridge.getGateStatus(provider);
    if (!status.unlocked) {
      await showQuiz(provider);
      return;
    }

    const prompt = promptInput!.value.trim();
    const providerKey = providerKeyInput!.value;
    if (!prompt || !providerKey) return;

    clearChildren(gateContainer!);
    await bridge.askAgent(prompt, provider, providerKey);
    appendRecent(recentList!, prompt);
    promptInput!.value = '';
    providerKeyInput!.value = ''; // never retained beyond this single call

    if (autoCollapseTimer) clearTimeout(autoCollapseTimer);
    autoCollapseTimer = setTimeout(collapse, AUTO_COLLAPSE_MS);
  }

  promptInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void handleAsk();
  });
}

// Production bootstrap: preload always exposes `window.clickclickPanel` before
// this module evaluates, so this is safe. Guarded so importing the module under
// a bridge-less test environment (jsdom, no preload) never throws.
if (typeof window !== 'undefined' && window.clickclickPanel) {
  initPanel(window.clickclickPanel, document);
}
