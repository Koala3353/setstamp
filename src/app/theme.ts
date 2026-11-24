import { useCallback, useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "gym.theme";
// Keep in sync with --bg in src/styles/tokens.css.
const META = { light: "#ebe9e6", dark: "#12100e" } as const;

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const listeners = new Set<() => void>();
let current: ThemePref = typeof window === "undefined" ? "system" : read();

/** Apply a theme preference to <html data-theme> and the browser chrome colour. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    const scheme = m.media.includes("dark") ? "dark" : "light";
    m.content = META[pref === "system" ? scheme : pref];
  });
}

export function setThemePref(pref: ThemePref): void {
  current = pref;
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: the choice lasts for this session only */
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

/** [preference, setPreference]. "system" follows prefers-color-scheme. */
export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const pref = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
  return [pref, useCallback((p: ThemePref) => setThemePref(p), [])];
}
