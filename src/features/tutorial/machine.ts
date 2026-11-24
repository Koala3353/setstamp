// First-run tour as a pure state machine. No DOM, no storage: the provider feeds it events
// (route + workout snapshots, app taps, Next/Skip) and persists what comes out.
import type { RouteName } from "../../app/router";

/** Bump when the tour changes. */
export const TUTORIAL_VERSION = 1;
/**
 * Finished or skipped tours older than this version are shown again. Raise it only when a change
 * is worth re-showing to people who already saw the tour; a copy fix bumps TUTORIAL_VERSION alone.
 */
export const RESHOW_BELOW_VERSION = 1;

export const STEP_IDS = ["welcome", "start", "add", "log", "edit", "wrap", "progressTab", "bodymap", "exercisesTab", "favorite", "done"] as const;
export type StepId = (typeof STEP_IDS)[number];

/** What the app looks like right now, as far as the tour cares. */
export type Snapshot = {
  route: RouteName | "notFound";
  /** The open (unfinished) workout, if any. */
  openSessionCid: string | null;
  /** Exercises in the open workout. */
  exerciseCount: number;
  /** Sets ticked done in the open workout (warm-ups included). */
  doneSetCount: number;
};

export type AppSignal = "muscle" | "favorite";

export type TourEvent =
  | { type: "next" }
  | { type: "skip" }
  | { type: "snapshot"; snap: Snapshot }
  | { type: "app"; name: AppSignal }
  /** The practice workout was discarded from the tour card. */
  | { type: "discarded" };

export type TourStatus = "active" | "done" | "skipped";

export type TourState = {
  version: number;
  status: TourStatus;
  step: StepId;
  /** The workout the tour started, so "Discard practice workout" never touches a real one. */
  practiceCid: string | null;
  /** True once the start step saw no open workout (so the next one opened is ours). */
  sawNoWorkout: boolean;
  /** Exercises in the workout when the add step began; adding one more completes it. */
  baseExercises: number;
};

export function freshTour(): TourState {
  return { version: TUTORIAL_VERSION, status: "active", step: "welcome", practiceCid: null, sawNoWorkout: false, baseExercises: 0 };
}

type StepRule = {
  /** The step is complete when this holds for the current snapshot. */
  doneWhen?: (snap: Snapshot, s: TourState) => boolean;
  /** An app signal that completes the step. */
  signal?: AppSignal;
};

const RULES: Record<StepId, StepRule> = {
  welcome: {},
  start: { doneWhen: (snap) => snap.openSessionCid !== null },
  add: { doneWhen: (snap, s) => snap.openSessionCid !== null && snap.exerciseCount > s.baseExercises },
  log: { doneWhen: (snap) => snap.doneSetCount > 0 },
  edit: {},
  // Finishing or discarding from the workout screen itself also moves on.
  wrap: { doneWhen: (snap) => snap.openSessionCid === null },
  progressTab: { doneWhen: (snap) => snap.route === "progress" },
  bodymap: { signal: "muscle" },
  exercisesTab: { doneWhen: (snap) => snap.route === "exercises" || snap.route === "exercise" },
  favorite: { signal: "favorite" },
  done: {},
};

export function stepIndex(step: StepId): number {
  return STEP_IDS.indexOf(step);
}

/** Move to the following step, running its entry bookkeeping. */
function advance(s: TourState, snap: Snapshot | null): TourState {
  const i = stepIndex(s.step);
  if (i >= STEP_IDS.length - 1) return { ...s, status: "done" };
  const leaving = s.step;
  let next: TourState = { ...s, step: STEP_IDS[i + 1]! };
  if (leaving === "start" && snap?.openSessionCid) {
    next.practiceCid = s.sawNoWorkout ? snap.openSessionCid : null;
  }
  if (next.step === "add") next.baseExercises = snap?.exerciseCount ?? 0;
  if (next.step === "start") next.sawNoWorkout = snap ? snap.openSessionCid === null : false;
  // A practice workout that's gone (discarded or finished) has nothing left to discard.
  if (next.practiceCid && snap && snap.openSessionCid !== next.practiceCid && stepIndex(next.step) > stepIndex("wrap")) {
    next = { ...next, practiceCid: null };
  }
  return next;
}

/** Advance through every step the snapshot already satisfies. */
function settle(s: TourState, snap: Snapshot): TourState {
  let cur = s;
  for (let guard = 0; guard < STEP_IDS.length && cur.status === "active"; guard++) {
    if (cur.step === "start" && snap.openSessionCid === null && !cur.sawNoWorkout) cur = { ...cur, sawNoWorkout: true };
    // A program day writes its exercises right after the workout opens: a jump of more than one
    // is that load arriving, not the user adding an exercise. Count from there instead.
    if (cur.step === "add" && snap.exerciseCount > cur.baseExercises + 1) cur = { ...cur, baseExercises: snap.exerciseCount };
    const rule = RULES[cur.step];
    if (!rule.doneWhen || !rule.doneWhen(snap, cur)) break;
    cur = advance(cur, snap);
  }
  return cur;
}

export function reduce(s: TourState, e: TourEvent, snap: Snapshot | null = null): TourState {
  if (s.status !== "active") return s;
  switch (e.type) {
    case "skip":
      return { ...s, status: "skipped", practiceCid: null };
    case "next": {
      const moved = advance(s, snap);
      return snap && moved.status === "active" ? settle(moved, snap) : moved;
    }
    case "snapshot":
      return settle(s, e.snap);
    case "app":
      if (RULES[s.step].signal !== e.name) return s;
      return snap ? settle(advance(s, snap), snap) : advance(s, snap);
    case "discarded":
      if (s.step !== "wrap") return { ...s, practiceCid: null };
      return { ...advance(s, snap), practiceCid: null };
  }
}

/** Whether a step offers Next (it's something to look at, or there's nothing left to do). */
export function canGoNext(step: StepId, snap: Snapshot): boolean {
  switch (step) {
    case "start":
    case "log":
    case "progressTab":
    case "exercisesTab":
      return false;
    case "add":
      // A program day arrives with exercises; adding is optional then.
      return snap.exerciseCount > 0;
    default:
      return true;
  }
}

// ---------- persistence ----------

/** Tolerant parse: anything unexpected reads as "no record". */
export function parseStored(raw: string | null | undefined): TourState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TourState> | null;
    if (!v || typeof v !== "object") return null;
    if (typeof v.version !== "number" || !Number.isFinite(v.version)) return null;
    if (v.status !== "active" && v.status !== "done" && v.status !== "skipped") return null;
    const step = STEP_IDS.includes(v.step as StepId) ? (v.step as StepId) : "welcome";
    return {
      version: v.version,
      status: v.status,
      step,
      practiceCid: typeof v.practiceCid === "string" ? v.practiceCid : null,
      sawNoWorkout: v.sawNoWorkout === true,
      baseExercises: typeof v.baseExercises === "number" && v.baseExercises >= 0 ? v.baseExercises : 0,
    };
  } catch {
    return null;
  }
}

/**
 * What to do on app start: resume a tour in progress, start a fresh one, or nothing.
 * `isNewUser` = no workouts on the account after the first sync.
 */
export function startupDecision(stored: TourState | null, isNewUser: boolean): "resume" | "start" | "none" {
  if (stored?.status === "active") return stored.version === TUTORIAL_VERSION ? "resume" : "start";
  if (stored) return stored.version < RESHOW_BELOW_VERSION ? "start" : "none";
  return isNewUser ? "start" : "none";
}
