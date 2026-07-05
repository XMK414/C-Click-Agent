// app/preload.ts — the ONLY renderer API surface (plan §7).
//
// SLICE 1.4/1.5. Exposes a typed, minimal contextBridge: renderers get NO Node
// access, NO ipcRenderer, only these named, read-only listener channels. Raw
// action payloads can never be sent from here — the renderer may only
// approve/deny a main-issued proposalId (that surface lands in 1.5).

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './ipc/channels.js';
import type { OverlayBridge } from './overlay/overlay.js';

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

contextBridge.exposeInMainWorld('clickclick', overlayBridge);
