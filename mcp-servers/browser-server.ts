// mcp-servers/browser-server.ts — browser automation. Phase 4.
//
// puppeteer-core ATTACH to the user's Chrome with consent (NOT full Puppeteer's
// ~170MB bundled Chromium — FS-G #14). All input-adjacent tools (browser.open,
// browser.click, browser.type) are ACTION-class → confirm-gated. browser.getDom
// is read_only. DOM content is untrusted (injection surface).
export {};
