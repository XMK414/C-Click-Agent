// gateway/auth.ts
//
// Per-launch random bearer token (plan §7). Every request to the gateway and to
// every MCP server must carry this token, or it is rejected. This defeats local
// CSRF / DNS-rebinding against localhost and rogue local processes: the token
// exists only in this process tree's memory for this run.
//
// Pure logic + Node crypto only. No Electron, no network.

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of entropy, URL-safe. Regenerated every launch — never persisted. */
export function generateLaunchToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Constant-time comparison to avoid leaking token bytes via timing.
 * Returns false for any shape mismatch rather than throwing.
 */
export function isValidToken(expected: string, presented: unknown): boolean {
  if (typeof presented !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extract a bearer token from an Authorization header value. */
export function parseBearer(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1] ?? null;
}

/**
 * Guard usable by both the Express gateway and the ws MCP servers.
 * `authHeader` is the raw Authorization header value.
 */
export function authorize(expectedToken: string, authHeader: unknown): boolean {
  const presented = parseBearer(authHeader);
  if (presented === null) return false;
  return isValidToken(expectedToken, presented);
}
