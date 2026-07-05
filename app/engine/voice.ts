// app/engine/voice.ts — wake word + voice session. Phase 4.
// "Hey Click Click" KWS → session manager (mic consent + indicator + timeout +
// ESC/"cancel") → STT → NLU (whitelisted intents; unknown → no command) → router.
// Press-to-talk override always available. No raw audio stored; transcripts opt-in.
export {};
