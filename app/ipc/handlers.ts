// app/ipc/handlers.ts — main-process IPC handlers + proposal registry.
//
// SLICE 1.2/1.7. Every inbound payload is validated with app/ipc/schemas.ts
// BEFORE use. The proposal registry is the security core of the confirm flow:
//   - main mints a proposalId (uuid) and stores the ProposedAction in a Map
//   - the renderer can only send { proposalId, approved }
//   - on approve, main looks up the stored action and executes via PlatformBridge
//   - on deny/timeout, the entry is dropped; the renderer never supplies the action
//
// Pseudocode of the load-bearing path:
//   ipcMain.on(AUTOMATION_DECISION, (_e, raw) => {
//     const parsed = safeParse(automationDecisionSchema, raw);
//     if (!parsed.ok) return log.reject(parsed.error);
//     const action = proposals.take(parsed.value.proposalId); // consume once
//     if (action && parsed.value.approved) executeConfirmed(action);
//   });
export {};
