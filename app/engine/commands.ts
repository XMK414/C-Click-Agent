// app/engine/commands.ts
//
// Command Router (plan FS-A). All inputs (voice, keyboard, system) feed into one
// router: validate against an allowlist → dispatch → emit events → per-source
// rate-limit. The registry is immutable in production. No dynamic eval, ever.

import type { CommandInput } from '../ipc/schemas.js';

export type CommandSource = 'voice' | 'keyboard' | 'system';

export interface Command extends CommandInput {
  source: CommandSource;
}

export type CommandHandler = (cmd: Command) => void | Promise<void>;

export interface RateLimitConfig {
  /** Max commands per source within the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type DispatchResult =
  | { status: 'dispatched' }
  | { status: 'unknown_command'; id: string }
  | { status: 'rate_limited'; source: CommandSource };

export interface RouterEvents {
  onDispatch?: (cmd: Command, latencyMs: number, result: DispatchResult['status']) => void;
}

const DEFAULT_RATE: RateLimitConfig = { max: 10, windowMs: 1000 };

export class CommandRouter {
  private readonly handlers: ReadonlyMap<string, CommandHandler>;
  private readonly rate: RateLimitConfig;
  private readonly events: RouterEvents;
  private readonly hits = new Map<CommandSource, number[]>();
  private readonly now: () => number;

  constructor(
    handlers: Record<string, CommandHandler>,
    opts: { rate?: RateLimitConfig; events?: RouterEvents; now?: () => number } = {},
  ) {
    // Frozen registry — no runtime mutation (plan §7 secure configuration).
    this.handlers = new Map(Object.entries(handlers));
    this.rate = opts.rate ?? DEFAULT_RATE;
    this.events = opts.events ?? {};
    this.now = opts.now ?? Date.now;
  }

  /** True if the id is an allowlisted command. */
  knows(id: string): boolean {
    return this.handlers.has(id);
  }

  private allow(source: CommandSource): boolean {
    const t = this.now();
    const windowStart = t - this.rate.windowMs;
    const arr = (this.hits.get(source) ?? []).filter((ts) => ts > windowStart);
    if (arr.length >= this.rate.max) {
      this.hits.set(source, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(source, arr);
    return true;
  }

  async dispatch(cmd: Command): Promise<DispatchResult> {
    const start = this.now();
    const handler = this.handlers.get(cmd.id);
    if (!handler) {
      const result: DispatchResult = { status: 'unknown_command', id: cmd.id };
      this.events.onDispatch?.(cmd, this.now() - start, result.status);
      return result;
    }
    if (!this.allow(cmd.source)) {
      const result: DispatchResult = { status: 'rate_limited', source: cmd.source };
      this.events.onDispatch?.(cmd, this.now() - start, result.status);
      return result;
    }
    await handler(cmd);
    const result: DispatchResult = { status: 'dispatched' };
    this.events.onDispatch?.(cmd, this.now() - start, result.status);
    return result;
  }
}
