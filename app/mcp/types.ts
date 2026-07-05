// app/mcp/types.ts — MCP tool schemas + responses. Phase 3.
export type ToolClass = 'read_only' | 'action';
export interface ToolCall { serverId: string; toolName: string; args: Record<string, unknown>; }
