// app/platform/native/windows-bridge.cpp
//
// Windows native addon (Node-API via node-addon-api) for slice 1.8.
//
// ⚠ BUILD/TEST ON WINDOWS ONLY. This file is a complete implementation but it CANNOT
// be compiled or exercised in a Linux sandbox. It is verified on the windows-latest CI
// lane (node-gyp rebuild + the native smoke test + the assist e2e). The security
// DECISIONS (token whitelist, coordinate clamping, kill-switch gating, mock fallback)
// live in app/platform/windows.ts and ARE unit-tested; this layer is the OS mechanism.
//
// It includes vk-map.generated.h (produced from app/platform/vk-map.json) so the native
// VK table is the same source as the TS whitelist — no drift.
//
// HARD CONSTRAINTS (enforced here + asserted by the export-surface native test):
//   Exposes exactly six functions and NOTHING else. No registry access, no filesystem
//   writes/deletes, no process termination, no shell execution, no network, no private
//   APIs. Defense in depth: sendKeys re-validates every incoming VK against the allowed
//   set even though TS already validated the tokens.

#include <napi.h>
#include <windows.h>
#include <wincodec.h>
#include <vector>
#include <string>
#include <unordered_set>
#include "vk-map.generated.h"

#pragma comment(lib, "windowscodecs.lib")

namespace {

// --- base64 (no external deps) ------------------------------------------------
std::string Base64(const std::vector<BYTE>& in) {
  static const char* t =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  int val = 0, bits = -6;
  for (BYTE c : in) {
    val = (val << 8) + c; bits += 8;
    while (bits >= 0) { out.push_back(t[(val >> bits) & 0x3F]); bits -= 6; }
  }
  if (bits > -6) out.push_back(t[((val << 8) >> (bits + 8)) & 0x3F]);
  while (out.size() % 4) out.push_back('=');
  return out;
}

// Allowed VK values, derived ONCE from the generated map (defense in depth for sendKeys).
const std::unordered_set<int>& AllowedVks() {
  static const std::unordered_set<int> s = [] {
    std::unordered_set<int> v;
    for (const auto& kv : clickclick::TokenToVk()) v.insert(kv.second);
    return v;
  }();
  return s;
}

// --- getCursorPos -------------------------------------------------------------
Napi::Value GetCursorPos(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  POINT p;
  if (!::GetCursorPos(&p)) Napi::Error::New(env, "GetCursorPos failed").ThrowAsJavaScriptException();
  Napi::Object o = Napi::Object::New(env);
  o.Set("x", Napi::Number::New(env, p.x));
  o.Set("y", Napi::Number::New(env, p.y));
  return o;
}

// --- moveCursor (absolute, normalized across the virtual desktop) -------------
Napi::Value MoveCursor(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int x = info[0].As<Napi::Number>().Int32Value();
  int y = info[1].As<Napi::Number>().Int32Value();
  int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
  int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  double nx = (double)(x - vx) * 65535.0 / (double)(vw > 1 ? vw - 1 : 1);
  double ny = (double)(y - vy) * 65535.0 / (double)(vh > 1 ? vh - 1 : 1);
  INPUT in{}; in.type = INPUT_MOUSE;
  in.mi.dx = (LONG)(nx + 0.5); in.mi.dy = (LONG)(ny + 0.5);
  in.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
  if (SendInput(1, &in, sizeof(INPUT)) != 1)
    Napi::Error::New(env, "SendInput(move) failed").ThrowAsJavaScriptException();
  return env.Undefined();
}

// --- click (0=left 1=right 2=middle) ------------------------------------------
Napi::Value Click(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  int b = info[0].As<Napi::Number>().Int32Value();
  DWORD down, up;
  switch (b) {
    case 1: down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; break;
    case 2: down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; break;
    default: down = MOUSEEVENTF_LEFTDOWN; up = MOUSEEVENTF_LEFTUP; break;
  }
  INPUT seq[2]{}; seq[0].type = INPUT_MOUSE; seq[0].mi.dwFlags = down;
  seq[1].type = INPUT_MOUSE; seq[1].mi.dwFlags = up;
  if (SendInput(2, seq, sizeof(INPUT)) != 2)
    Napi::Error::New(env, "SendInput(click) failed").ThrowAsJavaScriptException();
  return env.Undefined();
}

// --- sendKeys (vkCodes held after modifiers; native re-validates every VK) -----
Napi::Value SendKeys(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  Napi::Array keys = info[0].As<Napi::Array>();
  Napi::Array mods = info[1].As<Napi::Array>();
  std::vector<WORD> modVk, keyVk;
  const auto& allowed = AllowedVks();
  auto collect = [&](Napi::Array a, std::vector<WORD>& out) {
    for (uint32_t i = 0; i < a.Length(); i++) {
      int vk = a.Get(i).As<Napi::Number>().Int32Value();
      if (allowed.find(vk) == allowed.end()) {   // native guard: unknown VK => refuse
        Napi::Error::New(env, "Disallowed VK code").ThrowAsJavaScriptException();
        return false;
      }
      out.push_back((WORD)vk);
    }
    return true;
  };
  if (!collect(mods, modVk) || !collect(keys, keyVk)) return env.Undefined();

  std::vector<INPUT> seq;
  auto press = [&](WORD vk, bool up) {
    INPUT in{}; in.type = INPUT_KEYBOARD; in.ki.wVk = vk;
    if (up) in.ki.dwFlags = KEYEVENTF_KEYUP;
    seq.push_back(in);
  };
  for (WORD m : modVk) press(m, false);         // modifiers down
  for (WORD k : keyVk) { press(k, false); press(k, true); } // key down+up
  for (auto it = modVk.rbegin(); it != modVk.rend(); ++it) press(*it, true); // modifiers up
  if (!seq.empty() && SendInput((UINT)seq.size(), seq.data(), sizeof(INPUT)) != seq.size())
    Napi::Error::New(env, "SendInput(keys) failed").ThrowAsJavaScriptException();
  return env.Undefined();
}

// --- captureScreen (GDI BitBlt -> WIC PNG -> base64) --------------------------
// GDI baseline works on every supported build. WGC/D3D11 is a future enhancement for
// per-window/HDR capture; noted in the slice guide, not required for MVP.
Napi::Value CaptureScreen(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  // `fullScreen` arg reserved: MVP captures the virtual desktop; active-window crop is
  // applied by the caller/WGC path later.
  int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
  int w = GetSystemMetrics(SM_CXVIRTUALSCREEN), h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  HDC screen = GetDC(NULL), mem = CreateCompatibleDC(screen);
  HBITMAP bmp = CreateCompatibleBitmap(screen, w, h);
  HGDIOBJ old = SelectObject(mem, bmp);
  BitBlt(mem, 0, 0, w, h, screen, vx, vy, SRCCOPY | CAPTUREBLT);

  BITMAPINFO bi{}; bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bi.bmiHeader.biWidth = w; bi.bmiHeader.biHeight = -h; // top-down
  bi.bmiHeader.biPlanes = 1; bi.bmiHeader.biBitCount = 32; bi.bmiHeader.biCompression = BI_RGB;
  std::vector<BYTE> pixels((size_t)w * h * 4);
  GetDIBits(mem, bmp, 0, h, pixels.data(), &bi, DIB_RGB_COLORS);

  SelectObject(mem, old); DeleteObject(bmp); DeleteDC(mem); ReleaseDC(NULL, screen);

  // Encode PNG via WIC into an in-memory stream.
  IWICImagingFactory* factory = nullptr; IWICStream* stream = nullptr;
  IWICBitmapEncoder* enc = nullptr; IWICBitmapFrameEncode* frame = nullptr;
  IStream* mstream = nullptr; std::string out;
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (SUCCEEDED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                 IID_PPV_ARGS(&factory)))) {
    CreateStreamOnHGlobal(NULL, TRUE, &mstream);
    factory->CreateStream(&stream); stream->InitializeFromIStream(mstream);
    factory->CreateEncoder(GUID_ContainerFormatPng, nullptr, &enc);
    enc->Initialize(stream, WICBitmapEncoderNoCache);
    enc->CreateNewFrame(&frame, nullptr); frame->Initialize(nullptr);
    frame->SetSize(w, h);
    WICPixelFormatGUID fmt = GUID_WICPixelFormat32bppBGRA; frame->SetPixelFormat(&fmt);
    frame->WritePixels(h, w * 4, (UINT)pixels.size(), pixels.data());
    frame->Commit(); enc->Commit();

    HGLOBAL hg = NULL; GetHGlobalFromStream(mstream, &hg);
    SIZE_T sz = GlobalSize(hg); BYTE* p = (BYTE*)GlobalLock(hg);
    out = Base64(std::vector<BYTE>(p, p + sz)); GlobalUnlock(hg);
  }
  if (frame) frame->Release(); if (enc) enc->Release(); if (stream) stream->Release();
  if (mstream) mstream->Release(); if (factory) factory->Release();
  return Napi::String::New(env, out);
}

// --- focusWindow (title match -> SetForegroundWindow) -------------------------
Napi::Value FocusWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::string title = info[0].As<Napi::String>().Utf8Value();
  HWND hwnd = FindWindowA(nullptr, title.c_str());
  if (!hwnd) { Napi::Error::New(env, "window not found").ThrowAsJavaScriptException(); return env.Undefined(); }
  // Handle the foreground-lock quirk by attaching to the foreground thread briefly.
  DWORD fg = GetWindowThreadProcessId(GetForegroundWindow(), nullptr);
  DWORD me = GetCurrentThreadId();
  AttachThreadInput(me, fg, TRUE);
  SetForegroundWindow(hwnd); SetActiveWindow(hwnd);
  AttachThreadInput(me, fg, FALSE);
  return env.Undefined();
}

} // namespace

// --- export surface: EXACTLY six functions, nothing else ----------------------
// Napi::Function::New<Callback>(env, name) (cb as an explicit non-type template
// argument) rather than New(env, cb): passing a plain function pointer as a
// runtime argument is ambiguous against this node-addon-api's Callable-deducing
// overload under MSVC and fails to compile (C2665) — the template-argument form
// is also node-addon-api's own recommended pattern for a plain Callback.
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getCursorPos", Napi::Function::New<GetCursorPos>(env, "getCursorPos"));
  exports.Set("moveCursor",   Napi::Function::New<MoveCursor>(env, "moveCursor"));
  exports.Set("click",        Napi::Function::New<Click>(env, "click"));
  exports.Set("sendKeys",     Napi::Function::New<SendKeys>(env, "sendKeys"));
  exports.Set("captureScreen",Napi::Function::New<CaptureScreen>(env, "captureScreen"));
  exports.Set("focusWindow",  Napi::Function::New<FocusWindow>(env, "focusWindow"));
  return exports;
}
NODE_API_MODULE(windows_bridge, Init)
