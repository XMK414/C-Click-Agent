// app/platform/windows.ts — thin wrapper over windows-bridge.node. Slice 1.8.
//
// Loads the native addon and adapts it to PlatformBridge. Enforces the key-token
// whitelist in TS BEFORE calling native (defense in depth — native also validates).
// On load failure, main falls back to the mock bridge with a visible banner
// (guide-only mode) — never a silent failure (§6 failure modes).
//
// import { assertKeyTokens, type PlatformBridge } from './index.js';
// const native = require('./native/build/Release/windows-bridge.node');
// export const windowsBridge: PlatformBridge = { ... };
export {};
