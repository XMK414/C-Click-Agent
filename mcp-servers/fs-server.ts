// mcp-servers/fs-server.ts — read-only, SANDBOXED filesystem server. Phase 3.
//
// Replaces the raw export's arbitrary-read + synchronous home-dir walk (FS-D/FS-G #5):
//   - allowlisted roots (user-selected; default Documents/Downloads/Desktop)
//   - realpath canonicalization + prefix check (symlink-safe)
//   - denylist: .ssh, keychains, browser profiles, dotfiles by default
//   - fs.readFile size cap (1MB, UTF-8 only)
//   - fs.search ASYNC with depth/time/result budgets
// Binds 127.0.0.1, requires the per-launch bearer token.
export {};
