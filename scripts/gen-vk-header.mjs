// scripts/gen-vk-header.mjs
//
// Generates the C++ header the Windows native addon includes, FROM the same
// app/platform/vk-map.json that TS reads. Run at build time (wired into
// build:native:win). This is the mechanism that makes the TS whitelist and the native
// VK table physically one source — no drift, no "keep these in sync" comment to rot.
//
// Usage:  node scripts/gen-vk-header.mjs   (writes app/platform/native/vk-map.generated.h)
// CI should run this and fail if the committed header differs from the freshly generated
// one (a drift guard — see the check mode below).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const jsonPath = resolve(root, 'app/platform/vk-map.json');
const outPath = resolve(root, 'app/platform/native/vk-map.generated.h');

const MODIFIERS = ['CTRL', 'ALT', 'SHIFT', 'META', 'WIN', 'CMD'];

const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
const entries = Object.entries(raw)
  .filter(([k, v]) => !k.startsWith('_') && typeof v === 'number')
  .sort(([a], [b]) => a.localeCompare(b));

const vkLines = entries.map(([k, v]) => `    {"${k}", ${v}},`).join('\n');
const modLines = MODIFIERS.map((m) => `    "${m}",`).join('\n');

const header = `// vk-map.generated.h
// AUTO-GENERATED from app/platform/vk-map.json by scripts/gen-vk-header.mjs.
// DO NOT EDIT BY HAND. Regenerate: node scripts/gen-vk-header.mjs
#pragma once
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace clickclick {

// token -> Win32 Virtual-Key code
inline const std::unordered_map<std::string, int>& TokenToVk() {
  static const std::unordered_map<std::string, int> m = {
${vkLines}
  };
  return m;
}

// tokens treated as held-down modifiers
inline const std::unordered_set<std::string>& ModifierTokens() {
  static const std::unordered_set<std::string> m = {
${modLines}
  };
  return m;
}

// Look up a VK code; returns -1 for an unknown token (caller MUST reject -1 —
// the addon never injects an unmapped key).
inline int VkFor(const std::string& token) {
  const auto& m = TokenToVk();
  auto it = m.find(token);
  return it == m.end() ? -1 : it->second;
}

} // namespace clickclick
`;

const mode = process.argv[2];
if (mode === '--check') {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== header) {
    console.error('vk-map.generated.h is STALE. Run: node scripts/gen-vk-header.mjs');
    process.exit(1);
  }
  console.log('vk-map.generated.h is up to date.');
} else {
  writeFileSync(outPath, header);
  console.log(`Wrote ${outPath} (${entries.length} tokens).`);
}
