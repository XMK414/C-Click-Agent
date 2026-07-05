// app/preload.ts — the ONLY renderer API surface (plan §7).
//
// SLICE 1.4/1.5. Exposes typed, minimal contextBridge surfaces: renderers get NO
// Node access, NO ipcRenderer, only these named channels. The overlay bridge is
// read-only listeners. The panel bridge mediates every gateway call through
// main via ipcRenderer.invoke — no token, no raw gateway URL, and no raw action
// payload ever reaches either renderer.

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels.js';
import type { OverlayBridge } from './overlay/overlay.js';
import type { PanelBridge } from './panel/panel.js';

const overlayBridge: OverlayBridge = {
  onCursor(cb) {
    ipcRenderer.on(IPC_CHANNELS.CURSOR_POS_UPDATE, (_event, pos) => cb(pos));
  },
  onGuidance(cb) {
    ipcRenderer.on(IPC_CHANNELS.GUIDANCE_UPDATE, (_event, model) => cb(model));
  },
  onState(cb) {
    ipcRenderer.on(IPC_CHANNELS.CURSOR_STATE_UPDATE, (_event, state) => cb(state));
  },
};

const panelBridge: PanelBridge = {
  getProviders() {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_PROVIDERS);
  },
  askAgent(prompt, provider, providerKey) {
    return ipcRenderer.invoke(IPC_CHANNELS.ASK_AGENT, { prompt, provider, providerKey });
  },
  getGateStatus(provider) {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_GATE_STATUS, provider);
  },
  getQuiz(provider) {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_QUIZ, provider);
  },
  submitQuiz(provider, answers) {
    return ipcRenderer.invoke(IPC_CHANNELS.SUBMIT_QUIZ, provider, answers);
  },
  onPanelState(cb) {
    ipcRenderer.on(IPC_CHANNELS.PANEL_STATE, (_event, state) => cb(state));
  },
  onProposal(cb) {
    ipcRenderer.on(IPC_CHANNELS.AUTOMATION_PROPOSAL, (_event, raw) => cb(raw));
  },
  decide(proposalId, approved) {
    // send, not invoke — main doesn't return a value here; AUTOMATION_RESULT
    // (a separate push, not wired to this call's return) carries the outcome.
    ipcRenderer.send(IPC_CHANNELS.AUTOMATION_DECISION, { proposalId, approved });
  },
};

contextBridge.exposeInMainWorld('clickclick', overlayBridge);
contextBridge.exposeInMainWorld('clickclickPanel', panelBridge);
