// Rest timer that outlives screens and reloads. The end timestamp is persisted, and module-level
// timeouts fire the alerts wherever the user is in the app.
//
// Phases, all derived from endsAt and the clock (see restPhase):
//   running  now < endsAt                       countdown with -15 / +15 / sound / skip
//   over     endsAt <= now < endsAt + 5 minutes  "Rest over +0:12", counting up, with dismiss
//   (none)   cleared by skip/dismiss, the next start, or the 5 minutes running out
//
// Alerts: a chime (sound setting, on unless the user turned it off) and a vibration at the end,
// plus a short tick at 10 seconds left. iOS only lets Web Audio play from a context that was
// unlocked inside a user gesture, so one shared AudioContext is unlocked in rest.start() (called
// from the "log set" tap) and reused for every later sound. When the app is closed or the phone is
// locked, the UI layer's RestRemote (Web Push, see restPush.ts) delivers the alert instead.
import { useSyncExternalStore } from "react";

export type RestState = { endsAt: number; totalSec: number; label: string } | null;
export type RestPhase = "running" | "over";

/** How long the "Rest over" state stays up before clearing itself. */
export const REST_OVER_KEEP_MS = 5 * 60_000;
/** Heads-up tick before the end (only for rests long enough to need one). */
export const HEADS_UP_SEC = 10;

const KEY = "gym.rest.v1";
const SOUND_KEY = "gym.rest.sound";

/** Remote alerts (Web Push), registered by the UI layer that has a Convex client. */
export type RestRemote = {
  /** A rest started or changed: deliver an alert at endsAt even if the app is closed. */
  schedule(endsAt: number, label: string): void;
  /** The rest was skipped or dismissed: drop any pending remote alert. */
  cancel(): void;
  /** The local end alert just fired (the remote side may add a notification when hidden). */
  ended?(label: string): void;
};

let remote: RestRemote | null = null;
export function setRestRemote(r: RestRemote | null) {
  remote = r;
}

export function restPhase(s: RestState, now: number): RestPhase | null {
  if (!s) return null;
  if (now < s.endsAt) return "running";
  if (now < s.endsAt + REST_OVER_KEEP_MS) return "over";
  return null;
}

let state: RestState = read();
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();

function read(): RestState {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as RestState) : null;
    if (!s || typeof s.endsAt !== "number" || typeof s.totalSec !== "number") return null;
    return restPhase(s, Date.now()) ? { endsAt: s.endsAt, totalSec: s.totalSec, label: String(s.label ?? "") } : null;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the timer still runs for this page */
  }
}

function notify() {
  for (const l of [...listeners]) l();
}

function emit() {
  persist();
  arm();
  notify();
}

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function arm() {
  clearTimers();
  const s = state;
  if (!s) return;
  const now = Date.now();
  const phase = restPhase(s, now);
  if (phase === "running") {
    const headsUpAt = s.endsAt - HEADS_UP_SEC * 1000;
    if (s.totalSec > HEADS_UP_SEC * 2 && headsUpAt > now) {
      timers.push(setTimeout(headsUp, headsUpAt - now));
    }
    timers.push(
      setTimeout(() => {
        // Timers can fire a hair early; never flip to "over" before the real end.
        if (state !== s || Date.now() < s.endsAt) return arm();
        alertDone(s.label);
        emit();
      }, s.endsAt - now),
    );
  } else if (phase === "over") {
    timers.push(
      setTimeout(() => {
        if (state !== s) return;
        state = null;
        emit();
      }, s.endsAt + REST_OVER_KEEP_MS - now),
    );
  } else {
    state = null;
    persist();
  }
}

// --- Sound ------------------------------------------------------------------

export function soundEnabled(): boolean {
  try {
    // On unless the user turned it off ("0"). Older builds stored "0" as the default, but only
    // ever wrote the key when the user tapped the toggle, so a stored value is a real choice.
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (on) unlockAudio();
  notify();
}

type AudioCtor = typeof AudioContext;
let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (audio && audio.state !== "closed") return audio;
  if (typeof window === "undefined") return null;
  const Ctx: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    audio = new Ctx();
  } catch {
    audio = null;
  }
  return audio;
}

/**
 * Create/resume the shared AudioContext. Call from inside a user gesture: iOS Safari keeps a
 * context that was started from a tap able to play later, and blocks one created in a timer.
 */
export function unlockAudio() {
  if (!soundEnabled()) return;
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    // A one-sample silent buffer started in the gesture is what actually unlocks output on iOS.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22_050);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* audio blocked */
  }
}

type Tone = { hz: number; at: number; dur: number };

function playTones(tones: Tone[], volume: number) {
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.03;
    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = t.hz;
      const start = t0 + t.at;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  } catch {
    /* audio blocked */
  }
}

/** End of rest: three rising tones (G5, C6, G6), about 0.8 s, loud enough over gym music. */
const CHIME: Tone[] = [
  { hz: 784, at: 0, dur: 0.22 },
  { hz: 1047, at: 0.17, dur: 0.22 },
  { hz: 1568, at: 0.34, dur: 0.5 },
];
const TICK: Tone[] = [{ hz: 1047, at: 0, dur: 0.12 }];

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function headsUp() {
  if (!soundEnabled()) return;
  vibrate(60);
  playTones(TICK, 0.18);
}

function alertDone(label: string) {
  vibrate([220, 120, 220, 120, 220]);
  if (soundEnabled()) playTones(CHIME, 0.38);
  try {
    remote?.ended?.(label);
  } catch {
    /* remote alerts are best effort */
  }
}

// After a reload mid-rest there was no gesture yet: unlock on the first tap anywhere.
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    () => {
      if (restPhase(state, Date.now()) === "running" && audio?.state !== "running") unlockAudio();
    },
    { capture: true, passive: true },
  );
}

// --- Public API -------------------------------------------------------------

function clear() {
  if (!state) return;
  state = null;
  emit();
  remote?.cancel();
}

export const rest = {
  /** Call from the tap that logged the set, so audio can be unlocked inside the gesture. */
  start(sec: number, label: string) {
    if (!(sec > 0)) return;
    unlockAudio();
    state = { endsAt: Date.now() + sec * 1000, totalSec: sec, label };
    emit();
    remote?.schedule(state.endsAt, label);
  },
  /** -15 / +15 during the countdown. Taking it past zero ends the rest now. */
  adjust(deltaSec: number) {
    const now = Date.now();
    if (!state || restPhase(state, now) !== "running") return;
    unlockAudio();
    const endsAt = Math.max(now, state.endsAt + deltaSec * 1000);
    state = { ...state, endsAt, totalSec: Math.max(1, state.totalSec + deltaSec) };
    emit();
    if (endsAt > now) remote?.schedule(endsAt, state.label);
    else remote?.cancel(); // the local alert fires right away
  },
  skip: clear,
  /** Close the "Rest over" state. */
  dismiss: clear,
};

arm(); // resume after reload

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useRest(): RestState {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
export function useRestSound(): boolean {
  return useSyncExternalStore(subscribe, soundEnabled, () => true);
}

/** Current state, for tests and non-React callers. */
export function getRest(): RestState {
  return state;
}
