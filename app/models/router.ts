// app/models/router.ts — app-side routing to the gateway. Slice 1.6/3.4.
//
// Sends the bearer token on every gateway call. The tool-call follow-up appends
// the tool result as a `tool` role message (NOT `assistant` — the raw export's
// role was wrong and would corrupt provider context, FS-D/FS-G #15).
export {};
