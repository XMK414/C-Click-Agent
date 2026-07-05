// windows-bridge.cpp — Win32 Node-API addon. Slice 1.8.
//
// Exposes: getCursorPos (GetCursorPos), moveCursor (SendInput MOVE|ABSOLUTE,
// normalized 0..65535/display), click (SendInput down+up), sendKeys (SendInput
// INPUT_KEYBOARD via a token→VK map — tokens are whitelisted in TS), captureScreen
// (Windows.Graphics.Capture / D3D11, GDI fallback, WIC→PNG→base64), focusWindow
// (FindWindow + SetForegroundWindow).
//
// HARD CONSTRAINTS (enforced by code review + safety tests, FS-B):
//   no registry access · no fs writes/deletes · no process termination
//   no shell execution · no network calls · no private APIs
//
// #include <napi.h>
// #include <windows.h>
// ... Napi::Object Init(Napi::Env, Napi::Object) { ... }
