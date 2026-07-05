// gateway/providers/types.ts — upstream call contract. Slice 1.6.
import type { GuidanceResponse } from '../../app/models/types.js';

export interface UpstreamRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  imageBase64?: string;
  apiKey: string; // BYO key, from the user's machine — never persisted server-side
}

export interface UpstreamAdapter {
  chat(req: UpstreamRequest): Promise<GuidanceResponse>;
}
