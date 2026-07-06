// vk-map.generated.h
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
    {"0", 48},
    {"1", 49},
    {"2", 50},
    {"3", 51},
    {"4", 52},
    {"5", 53},
    {"6", 54},
    {"7", 55},
    {"8", 56},
    {"9", 57},
    {"A", 65},
    {"ALT", 18},
    {"B", 66},
    {"BACKSPACE", 8},
    {"C", 67},
    {"CMD", 91},
    {"CTRL", 17},
    {"D", 68},
    {"DELETE", 46},
    {"DOWN", 40},
    {"E", 69},
    {"END", 35},
    {"ENTER", 13},
    {"ESC", 27},
    {"F", 70},
    {"F1", 112},
    {"F10", 121},
    {"F11", 122},
    {"F12", 123},
    {"F2", 113},
    {"F3", 114},
    {"F4", 115},
    {"F5", 116},
    {"F6", 117},
    {"F7", 118},
    {"F8", 119},
    {"F9", 120},
    {"G", 71},
    {"H", 72},
    {"HOME", 36},
    {"I", 73},
    {"J", 74},
    {"K", 75},
    {"L", 76},
    {"LEFT", 37},
    {"M", 77},
    {"META", 91},
    {"N", 78},
    {"O", 79},
    {"P", 80},
    {"Q", 81},
    {"R", 82},
    {"RIGHT", 39},
    {"S", 83},
    {"SHIFT", 16},
    {"SPACE", 32},
    {"T", 84},
    {"TAB", 9},
    {"U", 85},
    {"UP", 38},
    {"V", 86},
    {"W", 87},
    {"WIN", 91},
    {"X", 88},
    {"Y", 89},
    {"Z", 90},
  };
  return m;
}

// tokens treated as held-down modifiers
inline const std::unordered_set<std::string>& ModifierTokens() {
  static const std::unordered_set<std::string> m = {
    "CTRL",
    "ALT",
    "SHIFT",
    "META",
    "WIN",
    "CMD",
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
