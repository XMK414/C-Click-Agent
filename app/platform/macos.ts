// app/platform/macos.ts — thin wrapper over macos-bridge.node. Slice 2.1.
//
// Same contract as windows.ts. Additionally gates on TCC permissions
// (Accessibility for input/focus, Screen Recording for capture): if denied,
// feature-degrade with a deep link to System Settings — never crash.
export {};
