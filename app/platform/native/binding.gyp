{
  "targets": [
    {
      "target_name": "windows-bridge",
      "conditions": [["OS=='win'", {
        "sources": ["windows-bridge.cpp"],
        "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
        "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
      }]]
    },
    {
      "target_name": "macos-bridge",
      "conditions": [["OS=='mac'", {
        "sources": ["macos-bridge.mm"],
        "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
        "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
        "xcode_settings": {
          "OTHER_CFLAGS": ["-framework Cocoa", "-framework ApplicationServices", "-framework CoreGraphics"]
        }
      }]]
    }
  ]
}
