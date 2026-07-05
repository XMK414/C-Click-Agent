// app/ipc/channels.ts — the ONLY channel list in the codebase (plan FS-A).
// The raw export's duplicate/conflicting channel definitions are dead.

export const IPC_CHANNELS = {
  CURSOR_POS_UPDATE: 'cursor-pos-update', // main → overlay (~30–60Hz, change-detected)
  GUIDANCE_UPDATE: 'guidance-update', // main → overlay
  CURSOR_STATE_UPDATE: 'cursor-state-update', // main → overlay (6-state buddy cursor, incl. dev-cycle hook)
  AUTOMATION_PROPOSAL: 'automation-proposal', // main → panel
  AUTOMATION_DECISION: 'automation-decision', // panel → main
  AUTOMATION_RESULT: 'automation-result', // main → panel/overlay
  SCREEN_CAPTURE_REQUEST: 'screen-capture-request', // panel → main (consent flow)
  SCREEN_CAPTURE_RESPONSE: 'screen-capture-response', // main → panel
  PANEL_STATE: 'panel-state',
  MCP_SERVERS_UPDATE: 'mcp-servers-update',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
