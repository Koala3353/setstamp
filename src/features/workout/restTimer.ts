// Rest timer that outlives screens and reloads: the end timestamp is persisted, and a module-level
// timeout fires the vibration/sound wherever the user is in the app.
import { useSyncExternalStore } from "react";

export type RestState = { endsAt: number; totalSec: number; label: string } | null;

const KEY = "gym.rest.v1";
const SOUND_KEY = "gym.rest.sound";

let state: RestState = read();
let timeout: number | null = null;
const listeners = new Set<() => void>();

function read(): RestState {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as RestState) : null;
    return s && s.endsAt > Date.now() ? s : null;
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

function emit() {
  persist();
  arm();
  for (const l of [...listeners]) l();
}

function arm() {
  if (typeof window === "undefined") return;
  if (timeout !== null) window.clearTimeout(timeout);
  timeout = null;
  if (!state) return;
  timeout = window.setTimeout(() => {
    state = null;
    alertDone();
    emit();
  }, Math.max(0, state.endsAt - Date.now()));
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}
export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  for (const l of [...listeners]) l();
}

function alertDone() {
  try {
    navigator.vibrate?.([220, 120, 220]);
  } catch {
    /* unsupported */
  }
  if (!soundEnabled()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio blocked */
  }
}

export const rest = {
  start(sec: number, label: string) {
    if (!(sec > 0)) return;
    state = { endsAt: Date.now() + sec * 1000, totalSec: sec, label };
    emit();
  },
  adjust(deltaSec: number) {
    if (!state) return;
    const endsAt = state.endsAt + deltaSec * 1000;
    state = endsAt <= Date.now() ? null : { ...state, endsAt, totalSec: Math.max(1, state.totalSec + deltaSec) };
    emit();
  },
  skip() {
    state = null;
    emit();
  },
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
  return useSyncExternalStore(subscribe, soundEnabled, () => false);
}
