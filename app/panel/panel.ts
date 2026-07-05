// app/panel/panel.ts — panel state machine + confirmation UI. Slice 1.5.
//
// States: Collapsed · Expanded · Listening · Processing · Replying (FS-E table).
// Confirmation UI only ever sends { proposalId, approved } — never a raw action.
// Summon v1 = Ctrl+Shift+Space (globalShortcut). Double-Ctrl needs a low-level
// hook (native addon) — scheduled P4 slice 4.5 (FS-E honest constraint).
export {};
