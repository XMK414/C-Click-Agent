// macos-bridge.mm — Quartz/CoreGraphics/AX Node-API addon (Obj-C++). Slice 2.1.
//
// Exposes: getCursorPos (CGEventGetLocation), moveCursor/click (CGEvent* +
// CGEventPost kCGHIDEventTap), sendKeys (CGEventCreateKeyboardEvent), captureScreen
// (CGWindowListCreateImage — Scout verifies ScreenCaptureKit requirement on
// macOS 14+ — ImageIO→PNG→base64), focusWindow (AXUIElement kAXFrontmostAttribute;
// AppleScript `activate` fallback with a PARAMETERIZED app name — no script string
// injection, FS-B).
//
// Same HARD CONSTRAINTS as windows-bridge.cpp.
