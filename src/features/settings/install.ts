// "Install app": Chromium fires `beforeinstallprompt` once, early, so the listener is attached as
// soon as this module loads. src/main.tsx imports it first thing so the event is never missed.
// iOS Safari has no prompt API; the UI shows Add to Home Screen steps there instead.
// Used by Settings and by the install invitation (src/features/install).
import { useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let snap = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function emit() {
  snap = { canPrompt: deferred !== null, installed };
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    rememberInstalled();
    emit();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null; // the event can only be used once
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") {
    installed = true;
    rememberInstalled();
  }
  emit();
  return outcome;
}

export function useInstallState(): { canPrompt: boolean; installed: boolean } {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => snap,
  );
}

const INSTALLED_KEY = "gym.installed";

function rememberInstalled() {
  try {
    localStorage.setItem(INSTALLED_KEY, "1");
  } catch {
    // Storage blocked: the invitation may ask again next visit; harmless.
  }
}

/**
 * The app was installed from this browser at some point (appinstalled or an accepted prompt).
 * Only for deciding whether to invite again; Settings' live `installed` stays per-session so an
 * uninstalled app can be reinstalled from there.
 */
export function installedEarlier(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}
