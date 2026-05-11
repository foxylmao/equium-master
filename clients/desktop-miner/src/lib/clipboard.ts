// Single entry point for copying text. Tauri 2 requires both the plugin
// registered AND the capability granted (`clipboard-manager:allow-write-text`)
// — if either is missing, the call silently rejects. We fall back to the
// browser navigator.clipboard API so the button still works during dev when
// running in a regular browser tab.

import { writeText as tauriWriteText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyText(text: string): Promise<boolean> {
  try {
    await tauriWriteText(text);
    return true;
  } catch {
    // Tauri call failed — try the web API (works in dev mode + most browsers).
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}
