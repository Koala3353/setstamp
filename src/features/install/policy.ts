// When to invite a signed-in lifter to add the app to their home screen. Pure: no DOM, no storage.
// The component (InstallPrompt.tsx) gathers the inputs; tests cover the decisions.

/** How this browser installs a web app. */
export type InstallPlatform =
  /** Chromium captured `beforeinstallprompt`: one button does it. */
  | "prompt"
  /** iOS / iPadOS: Share, then Add to Home Screen. No API. */
  | "ios"
  /** Anything else: point at the browser menu. */
  | "manual";

/** What the lifter told us last time (persisted in localStorage). */
export type PromptMemory = {
  /** Epoch ms; don't ask before this. 0 = never snoozed. */
  snoozeUntil: number;
  /** "Don't ask again", or the app was installed from this browser. */
  never: boolean;
};

export const EMPTY_MEMORY: PromptMemory = { snoozeUntil: 0, never: false };
export const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** Let the first screen settle (and Chromium fire beforeinstallprompt) before asking. */
export const SHOW_DELAY_MS = 2500;

export function detectPlatform(input: { canPrompt: boolean; ios: boolean }): InstallPlatform {
  if (input.ios) return "ios";
  if (input.canPrompt) return "prompt";
  return "manual";
}

export type OfferInput = {
  /** Running as the installed app (display-mode standalone / navigator.standalone). */
  standalone: boolean;
  /** appinstalled fired, or the prompt was accepted, in this or an earlier visit. */
  installed: boolean;
  memory: PromptMemory;
  now: number;
  /** The lifter is on the Today screen (not inside a set editor or another flow). */
  onToday: boolean;
  /** A workout is being logged right now. */
  workoutActive: boolean;
  /** Already shown once since the page loaded. */
  shownThisSession: boolean;
};

export function shouldOfferInstall(i: OfferInput): boolean {
  if (i.standalone || i.installed) return false;
  if (i.memory.never) return false;
  if (i.now < i.memory.snoozeUntil) return false;
  if (!i.onToday || i.workoutActive) return false;
  if (i.shownThisSession) return false;
  return true;
}

export function snoozed(now: number): PromptMemory {
  return { snoozeUntil: now + SNOOZE_MS, never: false };
}

export function neverAgain(): PromptMemory {
  return { snoozeUntil: 0, never: true };
}

/** Tolerant parse: anything unexpected reads as "never asked". */
export function parseMemory(raw: string | null | undefined): PromptMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const v = JSON.parse(raw) as Partial<PromptMemory> | null;
    if (!v || typeof v !== "object") return EMPTY_MEMORY;
    return {
      snoozeUntil: typeof v.snoozeUntil === "number" && Number.isFinite(v.snoozeUntil) ? v.snoozeUntil : 0,
      never: v.never === true,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}
