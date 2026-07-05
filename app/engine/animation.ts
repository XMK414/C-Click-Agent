// app/engine/animation.ts — animation state machine. Phase 4.
// idle → listening → thinking → executing → success | error → idle.
// Valid-transition table enforced + unit-tested (e.g. success→thinking disallowed;
// error→idle fallback required). Hooks: onWake, onTranscriptReady, onCommandStart/End.
export {};
