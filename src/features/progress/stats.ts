// Pure derivations for the Stats tab. Same rules as the rest of Progress (src/logic/metrics.ts):
// only finished workouts, only done working sets (warm-ups never count), volume = weight × reps
// on rep-based sets, e1RM = Epley on ≤10 reps and always labelled an estimate. Everything is kept
// in kg and seconds here; the view converts to the user's unit.
//
// Weeks start on Monday at local midnight, like "This week" (model.weekStart). Calendar arithmetic
// goes through Date so a daylight-saving change never shifts a boundary by an hour.
//
// Shape: buildStatsIndex() walks every row once (O(sets)); everything range-dependent then works
// on per-session summaries (O(sessions)), so changing the range stays cheap at 60k sets.
import type { Muscle, MuscleGroup, Tracking } from "../../shared/domain";
import { MUSCLE_INFO, PRIMARY_SET_WEIGHT, SECONDARY_SET_WEIGHT } from "../../shared/domain";
import type { SessionData, SetData } from "../../shared/sync";
import { epley, isWorking, volumeLoad } from "../../logic/metrics";
import { weekStart } from "./model";

type Row<T> = { cid: string; data: T | null };
type TrackingOf = (exId: string) => Tracking;
type MusclesOf = (exId: string) => { primary: readonly Muscle[]; secondary: readonly Muscle[] } | undefined;

const EPS = 1e-6;

// ───────────────────────────── calendar helpers ─────────────────────────────

/** Local midnight of `t`'s day. */
export function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `n` calendar days after `t`'s day (negative goes back). */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Monday `n` weeks after the Monday of `t`'s week. */
export const addWeeks = (t: number, n: number) => addDays(weekStart(t), n * 7);

/** Local midnight on the 1st of `t`'s month. */
export function monthStart(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function addMonths(t: number, n: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

// ───────────────────────────── index ─────────────────────────────

export type SessionStat = {
  cid: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  bodyweightKg: number | null;
  /** Done working sets (warm-ups excluded). */
  workingSets: number;
  /** Σ weight × reps of done working sets on rep-based exercises (kg). */
  volumeKg: number;
  /** Done working sets per exercise. */
  exSets: Map<string, number>;
};

export type ExerciseLogSession = { sessionCid: string; at: number; sets: SetData[] };

export type ExerciseLog = {
  exId: string;
  tracking: Tracking;
  /** Finished sessions with done working sets of this exercise, oldest first. */
  sessions: ExerciseLogSession[];
};

export type StatsIndex = {
  /** Finished sessions, oldest first. */
  sessions: SessionStat[];
  exercises: Map<string, ExerciseLog>;
};

/**
 * One pass over the live rows. Deleted rows never reach here (useRows drops tombstones), and sets
 * whose session is missing or unfinished are ignored, so a deleted workout takes its sets with it.
 */
export function buildStatsIndex(
  sessions: readonly Row<SessionData>[],
  sets: readonly Row<SetData>[],
  trackingOf: TrackingOf,
): StatsIndex {
  const finished = new Map<string, SessionData>();
  for (const r of sessions) {
    const d = r.data;
    if (d && d.endedAt !== null) finished.set(r.cid, d);
  }
  // session → exercise → done working sets
  const grouped = new Map<string, Map<string, SetData[]>>();
  for (const r of sets) {
    const s = r.data;
    if (!s || !s.done || !isWorking(s) || !finished.has(s.sessionCid)) continue;
    let byEx = grouped.get(s.sessionCid);
    if (!byEx) grouped.set(s.sessionCid, (byEx = new Map()));
    const list = byEx.get(s.exId);
    if (list) list.push(s);
    else byEx.set(s.exId, [s]);
  }

  const out: SessionStat[] = [];
  const exercises = new Map<string, ExerciseLog>();
  const trackingCache = new Map<string, Tracking>();
  const tOf = (exId: string) => {
    let t = trackingCache.get(exId);
    if (t === undefined) trackingCache.set(exId, (t = trackingOf(exId)));
    return t;
  };
  for (const [cid, d] of finished) {
    const byEx = grouped.get(cid);
    const exSets = new Map<string, number>();
    let workingSets = 0;
    let volumeKg = 0;
    if (byEx) {
      for (const [exId, ss] of byEx) {
        ss.sort((a, b) => a.order - b.order);
        const tracking = tOf(exId);
        exSets.set(exId, ss.length);
        workingSets += ss.length;
        volumeKg += volumeLoad(ss, tracking);
        let log = exercises.get(exId);
        if (!log) exercises.set(exId, (log = { exId, tracking, sessions: [] }));
        log.sessions.push({ sessionCid: cid, at: d.startedAt, sets: ss });
      }
    }
    out.push({
      cid,
      name: d.name || "Workout",
      startedAt: d.startedAt,
      endedAt: d.endedAt!,
      durationSec: Math.max(0, (d.endedAt! - d.startedAt) / 1000),
      bodyweightKg: d.bodyweightKg !== null && d.bodyweightKg > 0 ? d.bodyweightKg : null,
      workingSets,
      volumeKg,
      exSets,
    });
  }
  out.sort((a, b) => a.startedAt - b.startedAt);
  for (const log of exercises.values()) log.sessions.sort((a, b) => a.at - b.at);
  return { sessions: out, exercises };
}

// ───────────────────────────── range ─────────────────────────────

export type StatsRange = "4w" | "12w" | "1y" | "all";
export const STATS_RANGES: readonly StatsRange[] = ["4w", "12w", "1y", "all"];
const RANGE_WEEKS: Record<Exclude<StatsRange, "all">, number> = { "4w": 4, "12w": 12, "1y": 52 };

export const isStatsRange = (v: unknown): v is StatsRange => typeof v === "string" && (STATS_RANGES as readonly string[]).includes(v);

export type RangeWindow = {
  /** Monday local midnight the range starts on (inclusive). */
  from: number;
  /** End of the range: now. */
  to: number;
  /** Calendar weeks covered, this (partial) week included. ≥ 1. */
  weeks: number;
};

/** Whole calendar weeks ending with the current one. "all" starts at the first workout's week. */
export function rangeWindow(index: StatsIndex, range: StatsRange, now: number): RangeWindow {
  const cur = weekStart(now);
  let from: number;
  if (range === "all") {
    const first = index.sessions.find((s) => s.startedAt <= now);
    from = first ? weekStart(first.startedAt) : cur;
  } else {
    from = addWeeks(cur, -(RANGE_WEEKS[range] - 1));
  }
  let weeks = 0;
  for (let w = from; w <= cur; w = addDays(w, 7)) weeks++;
  return { from, to: now, weeks: Math.max(1, weeks) };
}

/** Sessions inside the window (binary search on the sorted list). */
export function sessionsIn(index: StatsIndex, win: Pick<RangeWindow, "from" | "to">): SessionStat[] {
  const list = index.sessions;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.startedAt < win.from) lo = mid + 1;
    else hi = mid;
  }
  const out: SessionStat[] = [];
  for (let i = lo; i < list.length && list[i]!.startedAt <= win.to; i++) out.push(list[i]!);
  return out;
}

// ───────────────────────────── overview ─────────────────────────────

export type Overview = {
  workouts: number;
  workingSets: number;
  volumeKg: number;
  /** Σ session lengths (s) of finished workouts with a positive length. */
  timeSec: number;
  avgSessionSec: number | null;
  /** Workouts ÷ calendar weeks in the range (this week counted). */
  perWeek: number;
  weeks: number;
};

export function overview(index: StatsIndex, win: RangeWindow): Overview {
  let workouts = 0;
  let workingSets = 0;
  let volumeKg = 0;
  let timeSec = 0;
  let timed = 0;
  for (const s of sessionsIn(index, win)) {
    workouts++;
    workingSets += s.workingSets;
    volumeKg += s.volumeKg;
    if (s.durationSec > 0) {
      timeSec += s.durationSec;
      timed++;
    }
  }
  return {
    workouts,
    workingSets,
    volumeKg,
    timeSec,
    avgSessionSec: timed > 0 ? timeSec / timed : null,
    perWeek: workouts / win.weeks,
    weeks: win.weeks,
  };
}

export type Streak = {
  /** Consecutive calendar weeks with at least one finished workout. */
  weeks: number;
  /** True when this week already has a workout and is part of the run. */
  includesThisWeek: boolean;
};

/**
 * Weeks in a row with ≥1 finished workout, counted back from this week. A week that has not
 * ended yet doesn't break the run: with nothing logged this week, the count runs to last week.
 */
export function weeklyStreak(index: StatsIndex, now: number): Streak {
  const weeks = new Set<number>();
  for (const s of index.sessions) if (s.startedAt <= now) weeks.add(weekStart(s.startedAt));
  let cur = weekStart(now);
  const includesThisWeek = weeks.has(cur);
  if (!includesThisWeek) cur = addDays(cur, -7);
  let n = 0;
  while (weeks.has(cur)) {
    n++;
    cur = addDays(cur, -7);
  }
  return { weeks: n, includesThisWeek: includesThisWeek && n > 0 };
}

// ───────────────────────────── buckets (weeks or months) ─────────────────────────────

export type Bucket = {
  start: number;
  workouts: number;
  workingSets: number;
  volumeKg: number;
  /** The bucket containing now: still filling up. */
  current: boolean;
};

export type Buckets = { unit: "week" | "month"; list: Bucket[] };

/** Weekly totals; ranges longer than a year switch to calendar months so bars stay readable. */
export function buckets(index: StatsIndex, win: RangeWindow): Buckets {
  const unit = win.weeks > 53 ? "month" : "week";
  const keyOf = unit === "week" ? weekStart : monthStart;
  const step = unit === "week" ? (t: number) => addDays(t, 7) : (t: number) => addMonths(t, 1);
  const list: Bucket[] = [];
  const byStart = new Map<number, Bucket>();
  const last = keyOf(win.to);
  for (let t = keyOf(win.from); t <= last; t = step(t)) {
    const b: Bucket = { start: t, workouts: 0, workingSets: 0, volumeKg: 0, current: t === last };
    list.push(b);
    byStart.set(t, b);
  }
  for (const s of sessionsIn(index, win)) {
    const b = byStart.get(keyOf(s.startedAt));
    if (!b) continue;
    b.workouts++;
    b.workingSets += s.workingSets;
    b.volumeKg += s.volumeKg;
  }
  return { unit, list };
}

// ───────────────────────────── training calendar ─────────────────────────────

export type CalendarDay = { at: number; workouts: number; future: boolean };
export type TrainingCalendar = { weeks: number; from: number; days: CalendarDay[]; activeDays: number };

/** `weeks` columns × 7 rows (Mon … Sun), ending with this week. Days after today are `future`. */
export function trainingCalendar(index: StatsIndex, now: number, weeks: number): TrainingCalendar {
  const from = addWeeks(now, -(weeks - 1));
  const today = dayStart(now);
  const counts = new Map<number, number>();
  for (const s of sessionsIn(index, { from, to: now })) {
    const k = dayStart(s.startedAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const days: CalendarDay[] = [];
  let activeDays = 0;
  for (let i = 0, t = from; i < weeks * 7; i++, t = addDays(t, 1)) {
    const n = counts.get(t) ?? 0;
    if (n > 0) activeDays++;
    days.push({ at: t, workouts: n, future: t > today });
  }
  return { weeks, from, days, activeDays };
}

// ───────────────────────────── muscle groups (estimate) ─────────────────────────────

export type GroupShare = { group: MuscleGroup; sets: number };

export const SPLIT_GROUPS: readonly MuscleGroup[] = ["chest", "shoulders", "back", "arms", "core", "legs", "other"];

/**
 * Estimated working sets per muscle group, using the coverage weights (primary 1, secondary ½).
 * A set counts once per group at its strongest role there, so a row with lats and upper back
 * both primary is one back set, not two. `unmapped` = sets of exercises with no muscle data.
 */
export function groupSplit(
  index: StatsIndex,
  win: RangeWindow,
  musclesOf: MusclesOf,
): { groups: GroupShare[]; unmapped: number; total: number } {
  const perEx = new Map<string, number>();
  for (const s of sessionsIn(index, win)) for (const [exId, n] of s.exSets) perEx.set(exId, (perEx.get(exId) ?? 0) + n);
  const acc = new Map<MuscleGroup, number>();
  let unmapped = 0;
  let total = 0;
  for (const [exId, n] of perEx) {
    total += n;
    const m = musclesOf(exId);
    if (!m || (m.primary.length === 0 && m.secondary.length === 0)) {
      unmapped += n;
      continue;
    }
    const weight = new Map<MuscleGroup, number>();
    for (const mu of m.secondary) {
      const g = MUSCLE_INFO[mu]?.group;
      if (g) weight.set(g, Math.max(weight.get(g) ?? 0, SECONDARY_SET_WEIGHT));
    }
    for (const mu of m.primary) {
      const g = MUSCLE_INFO[mu]?.group;
      if (g) weight.set(g, Math.max(weight.get(g) ?? 0, PRIMARY_SET_WEIGHT));
    }
    for (const [g, w] of weight) acc.set(g, (acc.get(g) ?? 0) + w * n);
  }
  const groups = SPLIT_GROUPS.map((group) => ({ group, sets: acc.get(group) ?? 0 }))
    .filter((g) => g.sets > 0)
    .sort((a, b) => b.sets - a.sets || SPLIT_GROUPS.indexOf(a.group) - SPLIT_GROUPS.indexOf(b.group));
  return { groups, unmapped, total };
}

// ───────────────────────────── personal records ─────────────────────────────

/**
 * heaviest        — heaviest weight lifted for ≥1 rep (kg)
 * e1rm            — best Epley estimate, sets of ≤10 reps (kg, estimated)
 * reps_at_weight  — most reps at one exact weight (`value` reps, `atKg`)
 * most_reps       — most reps in one unloaded bodyweight set
 * longest_hold    — longest unloaded hold (s)
 * longest_at_load — longest hold at one exact load (`value` s, `atKg`)
 * load_distance   — best load × distance in one set (kg·m)
 */
export type PrKindStat = "heaviest" | "e1rm" | "reps_at_weight" | "most_reps" | "longest_hold" | "longest_at_load" | "load_distance";

export type PrEvent = {
  kind: PrKindStat;
  value: number;
  previous: number;
  atKg?: number;
  estimated: boolean;
};

/** Records one exercise set in one workout. */
export type PrMoment = { exId: string; sessionCid: string; at: number; events: PrEvent[] };

type Running = {
  heaviest: number | null;
  e1rm: number | null;
  mostReps: number | null;
  longestHold: number | null;
  loadDistance: number | null;
  repsAt: Map<number, number>;
  holdAt: Map<number, number>;
};

const kgKey = (kg: number) => Math.round(kg * 100);

function sessionBests(sets: readonly SetData[], tracking: Tracking): Running {
  const b: Running = { heaviest: null, e1rm: null, mostReps: null, longestHold: null, loadDistance: null, repsAt: new Map(), holdAt: new Map() };
  for (const s of sets) {
    const kg = s.weightKg ?? 0;
    switch (tracking) {
      case "weight_reps":
      case "bodyweight_reps": {
        const reps = s.reps ?? 0;
        if (reps <= 0) break;
        if (kg > 0 && s.assistKg === null) {
          b.heaviest = Math.max(b.heaviest ?? 0, kg);
          const e = epley(kg, reps);
          if (e) b.e1rm = Math.max(b.e1rm ?? 0, e.kg);
          const k = kgKey(kg);
          b.repsAt.set(k, Math.max(b.repsAt.get(k) ?? 0, reps));
        } else if (tracking === "bodyweight_reps") {
          b.mostReps = Math.max(b.mostReps ?? 0, reps);
        }
        break;
      }
      case "duration": {
        const sec = s.durationSec ?? 0;
        if (sec > 0) b.longestHold = Math.max(b.longestHold ?? 0, sec);
        break;
      }
      case "weight_duration": {
        const sec = s.durationSec ?? 0;
        if (sec <= 0) break;
        if (kg > 0) {
          const k = kgKey(kg);
          b.holdAt.set(k, Math.max(b.holdAt.get(k) ?? 0, sec));
        } else b.longestHold = Math.max(b.longestHold ?? 0, sec);
        break;
      }
      case "weight_distance": {
        const m = s.distanceM ?? 0;
        if (kg > 0 && m > 0) b.loadDistance = Math.max(b.loadDistance ?? 0, kg * m);
        break;
      }
      case "assisted_reps":
      case "distance_time":
        break; // no record shown here (assisted PRs live on the exercise page)
    }
  }
  return b;
}

function better(kind: PrKindStat, now: number | null, prev: number | null, events: PrEvent[]) {
  // A record needs something to beat: first-ever logs are not PRs.
  if (now === null || prev === null || !(now > prev + EPS)) return;
  events.push({ kind, value: now, previous: prev, estimated: kind === "e1rm" });
}

/**
 * Every PR across all history, newest first, one moment per exercise per workout. Each workout is
 * compared with everything logged before it, so a record in the visible range still had to beat
 * the full history. Linear in sets (running bests, no re-scans).
 */
export function prTimeline(index: StatsIndex): PrMoment[] {
  const out: PrMoment[] = [];
  for (const log of index.exercises.values()) {
    const run: Running = { heaviest: null, e1rm: null, mostReps: null, longestHold: null, loadDistance: null, repsAt: new Map(), holdAt: new Map() };
    for (const sess of log.sessions) {
      const b = sessionBests(sess.sets, log.tracking);
      const events: PrEvent[] = [];
      better("heaviest", b.heaviest, run.heaviest, events);
      better("e1rm", b.e1rm, run.e1rm, events);
      // Reps at a weight: only the heaviest weight that improved, so one workout reads as one line.
      let repsEvent: PrEvent | null = null;
      for (const [k, reps] of b.repsAt) {
        const prev = run.repsAt.get(k);
        if (prev !== undefined && reps > prev && (!repsEvent || k / 100 > repsEvent.atKg!)) {
          repsEvent = { kind: "reps_at_weight", value: reps, previous: prev, atKg: k / 100, estimated: false };
        }
      }
      if (repsEvent) events.push(repsEvent);
      better("most_reps", b.mostReps, run.mostReps, events);
      better("longest_hold", b.longestHold, run.longestHold, events);
      let holdEvent: PrEvent | null = null;
      for (const [k, sec] of b.holdAt) {
        const prev = run.holdAt.get(k);
        if (prev !== undefined && sec > prev && (!holdEvent || k / 100 > holdEvent.atKg!)) {
          holdEvent = { kind: "longest_at_load", value: sec, previous: prev, atKg: k / 100, estimated: false };
        }
      }
      if (holdEvent) events.push(holdEvent);
      better("load_distance", b.loadDistance, run.loadDistance, events);
      if (events.length) out.push({ exId: log.exId, sessionCid: sess.sessionCid, at: sess.at, events });

      // Merge this workout into the running bests.
      const max = (a: number | null, c: number | null) => (c === null ? a : a === null ? c : Math.max(a, c));
      run.heaviest = max(run.heaviest, b.heaviest);
      run.e1rm = max(run.e1rm, b.e1rm);
      run.mostReps = max(run.mostReps, b.mostReps);
      run.longestHold = max(run.longestHold, b.longestHold);
      run.loadDistance = max(run.loadDistance, b.loadDistance);
      for (const [k, v] of b.repsAt) run.repsAt.set(k, Math.max(run.repsAt.get(k) ?? 0, v));
      for (const [k, v] of b.holdAt) run.holdAt.set(k, Math.max(run.holdAt.get(k) ?? 0, v));
    }
  }
  return out.sort((a, b) => b.at - a.at || a.exId.localeCompare(b.exId));
}

export const prsIn = (timeline: readonly PrMoment[], win: Pick<RangeWindow, "from" | "to">) =>
  timeline.filter((m) => m.at >= win.from && m.at <= win.to);

// ───────────────────────────── exercises ─────────────────────────────

export type TrainedExercise = { exId: string; sets: number; workouts: number; lastAt: number };

/** Exercises by done working sets in the range, most first. `lastAt` is the last time ever. */
export function mostTrained(index: StatsIndex, win: RangeWindow, limit = 8): TrainedExercise[] {
  const acc = new Map<string, { sets: number; workouts: number }>();
  for (const s of sessionsIn(index, win)) {
    for (const [exId, n] of s.exSets) {
      const a = acc.get(exId) ?? { sets: 0, workouts: 0 };
      a.sets += n;
      a.workouts++;
      acc.set(exId, a);
    }
  }
  return [...acc]
    .map(([exId, a]) => {
      const log = index.exercises.get(exId);
      const lastAt = log && log.sessions.length ? log.sessions[log.sessions.length - 1]!.at : 0;
      return { exId, sets: a.sets, workouts: a.workouts, lastAt };
    })
    .sort((a, b) => b.sets - a.sets || b.lastAt - a.lastAt || a.exId.localeCompare(b.exId))
    .slice(0, limit);
}

export type SeriesPoint = { sessionCid: string; at: number; value: number };

/** Best e1RM per workout (≤10-rep sets only) for one exercise inside the window, oldest first. */
export function e1rmSeries(index: StatsIndex, exId: string, win: Pick<RangeWindow, "from" | "to">): SeriesPoint[] {
  const log = index.exercises.get(exId);
  if (!log || (log.tracking !== "weight_reps" && log.tracking !== "bodyweight_reps")) return [];
  const out: SeriesPoint[] = [];
  for (const sess of log.sessions) {
    if (sess.at < win.from || sess.at > win.to) continue;
    let best = 0;
    for (const s of sess.sets) {
      if (s.assistKg !== null) continue;
      const e = epley(s.weightKg, s.reps);
      if (e && e.kg > best) best = e.kg;
    }
    if (best > 0) out.push({ sessionCid: sess.sessionCid, at: sess.at, value: best });
  }
  return out;
}

/** Lifts worth an e1RM trend: rep-based, with ≥1 qualifying set in range, most working sets first. */
export function topLifts(index: StatsIndex, win: RangeWindow, limit = 5): string[] {
  return mostTrained(index, win, Number.POSITIVE_INFINITY)
    .filter((e) => e1rmSeries(index, e.exId, win).length > 0)
    .slice(0, limit)
    .map((e) => e.exId);
}

/** Bodyweight recorded on finished workouts in the window, oldest first. */
export function bodyweightSeries(index: StatsIndex, win: Pick<RangeWindow, "from" | "to">): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const s of sessionsIn(index, win)) if (s.bodyweightKg !== null) out.push({ sessionCid: s.cid, at: s.startedAt, value: s.bodyweightKg });
  return out;
}
