// app/mcp/registry.ts — known local MCP servers + tool-class map. Phase 3.
//
// url resolved at spawn (never hardcoded). NO auth tokens in source, ever
// (the raw export's `token: ''` field is dead — FS-D). toolClass is enforced
// SERVER-SIDE in the gateway, never by prompt.
import type { ToolClass } from './types.js';

export interface McpServerConfig {
  id: 'local-fs' | 'system-tools' | 'browser-tools' | string;
  name: string;
  url: `ws://127.0.0.1:${number}`; // resolved at spawn
  toolClass: Record<string, ToolClass>;
}
