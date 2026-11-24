// Pure derivations for the Progress screen. Metric rules live in src/logic/metrics.ts
// (docs/PLAN.md "Metrics"): working sets only, e1RM is Epley on ≤10 reps and labelled estimated,
// and every per-exercise number is only ever compared with the same exercise.
import type { Tracking } from "../../shared/domain";
import type { SessionData, SetData } from "../../shared/sync";
import { bests, epley, isWorking, volumeLoad } from "../../logic/metrics";

type Row<T> = { cid: string; data: T | null };
type TrackingOf = (exId: string) => Tracking;

const doneWorking = (s: SetData) => s.done && isWorking(s);

// ───────────────────────────── workout history ─────────────────────────────

export type HistoryEntry = {
  cid: string;
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  /** Done working sets (warm-ups excluded). */
  workingSets: number;
  /** Σ weight × reps of done working sets; assisted, timed and unloaded sets add nothing. */
  volumeKg: number;
  exerciseCount: number;
};

/** Finished sessions (endedAt set), newest first. */
export function workoutHistory(
  sessions: readonly Row<SessionData>[],
  sets: readonly Row<SetData>[],
  trackingOf: TrackingOf,
): HistoryEntry[] {
  const bySession = new Map<string, SetData[]>();
  for (const r of sets) {
    const s = r.data;
    if (!s || !s.done) continue;
    const list = bySession.get(s.sessionCid);
    if (list) list.push(s);
    else bySession.set(s.sessionCid, [s]);
  }
  const out: HistoryEntry[] = [];
  for (const r of sessions) {
    const d = r.data;
    if (!d || d.endedAt === null) continue;
    const done = bySession.get(r.cid) ?? [];
    const byEx = new Map<string, SetData[]>();
    for (const s of done) byEx.set(s.exId, [...(byEx.get(s.exId) ?? []), s]);
    let volumeKg = 0;
    for (const [exId, ss] of byEx) volumeKg += volumeLoad(ss, trackingOf(exId));
    out.push({
      cid: r.cid,
      name: d.name || "Workout",
      startedAt: d.startedAt,
      endedAt: d.endedAt,
      durationSec: Math.max(0, (d.endedAt - d.startedAt) / 1000),
      workingSets: done.filter(isWorking).length,
      volumeKg,
      exerciseCount: byEx.size,
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

// ───────────────────────────── exercises you've logged ─────────────────────────────

export type LoggedExercise = {
  exId: string;
  lastAt: number;
  sessions: number;
  workingSets: number;
};

/** Every exercise with at least one done set, most recently trained first. */
export function loggedExercises(sets: readonly Row<SetData>[], sessions: readonly Row<SessionData>[]): LoggedExercise[] {
  const startOf = new Map<string, number>();
  for (const r of sessions) if (r.data) startOf.set(r.cid, r.data.startedAt);
  const acc = new Map<string, { lastAt: number; sessions: Set<string>; workingSets: number }>();
  for (const r of sets) {
    const s = r.data;
    if (!s || !s.done) continue;
    const at = s.completedAt ?? startOf.get(s.sessionCid) ?? 0;
    const a = acc.get(s.exId) ?? {
      lastAt: 0,
      sessions: new Set<string>(),
      workingSets: 0,
    };
    a.lastAt = Math.max(a.lastAt, at);
    a.sessions.add(s.sessionCid);
    if (isWorking(s)) a.workingSets++;
    acc.set(s.exId, a);
  }
  return [...acc]
    .map(([exId, a]) => ({
      exId,
      lastAt: a.lastAt,
      sessions: a.sessions.size,
      workingSets: a.workingSets,
    }))
    .sort((a, b) => b.lastAt - a.lastAt || a.exId.localeCompare(b.exId));
}

// ───────────────────────────── one exercise ─────────────────────────────

export type ExerciseSession = {
  sessionCid: string;
  name: string;
  startedAt: number;
  sets: SetData[];
};

/** Sessions containing done sets of `exId`, newest first; sets in logged order. */
export function exerciseSessions(exId: string, sessions: readonly Row<SessionData>[], sets: readonly Row<SetData>[]): ExerciseSession[] {
  const bySession = new Map<string, SetData[]>();
  for (const r of sets) {
    const s = r.data;
    if (!s || s.exId !== exId || !s.done) continue;
    bySession.set(s.sessionCid, [...(bySession.get(s.sessionCid) ?? []), s]);
  }
  const meta = new Map<string, SessionData>();
  for (const r of sessions) if (r.data) meta.set(r.cid, r.data);
  const out: ExerciseSession[] = [];
  for (const [sessionCid, ss] of bySession) {
    const m = meta.get(sessionCid);
    const startedAt = m?.startedAt ?? Math.min(...ss.map((s) => s.completedAt ?? Infinity));
    out.push({
      sessionCid,
      name: m?.name || "Workout",
      startedAt: Number.isFinite(startedAt) ? startedAt : 0,
      sets: [...ss].sort((a, b) => a.order - b.order),
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export type PrCard =
  | { kind: "weight_at_reps"; reps: number; kg: number }
  | { kind: "e1rm"; kg: number }
  | { kind: "most_reps"; reps: number }
  | { kind: "least_assist"; reps: number; kg: number }
  | { kind: "longest_duration"; sec: number }
  | { kind: "session_volume"; kg: number };

/** All-time bests for one exercise, from its done working sets. Rep-count cards ascend by reps. */
export function prCards(sets: readonly SetData[], tracking: Tracking): PrCard[] {
  const b = bests(sets, tracking);
  const out: PrCard[] = [];
  if (b.e1rm !== null) out.push({ kind: "e1rm", kg: b.e1rm });
  for (const [reps, kg] of [...b.weightAtReps].sort((x, y) => x[0] - y[0])) out.push({ kind: "weight_at_reps", reps, kg });
  if (b.mostReps !== null) out.push({ kind: "most_reps", reps: b.mostReps });
  for (const [reps, kg] of [...b.leastAssistAtReps].sort((x, y) => x[0] - y[0])) out.push({ kind: "least_assist", reps, kg });
  if (b.longestDuration !== null) out.push({ kind: "longest_duration", sec: b.longestDuration });
  if (b.sessionVolume !== null) out.push({ kind: "session_volume", kg: b.sessionVolume });
  return out;
}

// ───────────────────────────── trend series ─────────────────────────────

/**
 * top    — heaviest done working set of the session (kg)
 * e1rm   — best Epley estimate of the session (≤10 reps only; estimated)
 * reps   — most reps in one set (bodyweight)
 * assist — least assistance in one set (assisted; lower is better)
 * hold   — longest hold in seconds (timed)
 */
export type TrendMetric = "top" | "e1rm" | "reps" | "assist" | "hold";

export type TrendPoint = {
  sessionCid: string;
  at: number;
  value: number;
  /** The set the point came from (for exact "as entered" display of top-set weights). */
  set: SetData;
};

/** Metrics that make sense for a tracking type. The first one is the default. */
export function metricsFor(tracking: Tracking, sets: readonly SetData[] = []): TrendMetric[] {
  switch (tracking) {
    case "weight_reps":
      return ["top", "e1rm"];
    case "bodyweight_reps":
      // Weighted variants (e.g. a belt) also get load metrics.
      return sets.some((s) => s.done && isWorking(s) && (s.weightKg ?? 0) > 0) ? ["reps", "top", "e1rm"] : ["reps"];
    case "assisted_reps":
      return ["assist", "reps"];
    case "duration":
    case "distance_time":
      return ["hold"];
  }
}

function pointValue(s: SetData, metric: TrendMetric): number | null {
  switch (metric) {
    case "top":
      return s.weightKg !== null && s.weightKg > 0 && (s.reps ?? 0) > 0 ? s.weightKg : null;
    case "e1rm":
      return epley(s.weightKg, s.reps)?.kg ?? null;
    case "reps":
      return s.reps !== null && s.reps > 0 ? s.reps : null;
    case "assist":
      return s.assistKg !== null && (s.reps ?? 0) > 0 ? s.assistKg : null;
    case "hold":
      return s.durationSec !== null && s.durationSec > 0 ? s.durationSec : null;
  }
}

/** One point per session (oldest first): that session's best value for `metric`. Sessions with none are skipped. */
export function trendSeries(history: readonly ExerciseSession[], metric: TrendMetric): TrendPoint[] {
  const lowerIsBetter = metric === "assist";
  const out: TrendPoint[] = [];
  for (const h of history) {
    let best: { v: number; s: SetData } | null = null;
    for (const s of h.sets) {
      if (!doneWorking(s)) continue;
      const v = pointValue(s, metric);
      if (v === null) continue;
      if (!best || (lowerIsBetter ? v < best.v : v > best.v)) best = { v, s };
    }
    if (best)
      out.push({
        sessionCid: h.sessionCid,
        at: h.startedAt,
        value: best.v,
        set: best.s,
      });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ───────────────────────────── weekly summary ─────────────────────────────

/** Local midnight of the Monday that starts `now`'s week. */
export function weekStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - back);
  return d.getTime();
}

export type WeeklySummary = {
  weekStart: number;
  sessions: number;
  workingSets: number;
  exercises: number;
};

/** This calendar week (Monday start, local time): finished sessions, done working sets, distinct exercises. */
export function weeklySummary(sessions: readonly Row<SessionData>[], sets: readonly Row<SetData>[], now: number): WeeklySummary {
  const from = weekStart(now);
  let n = 0;
  for (const r of sessions) {
    const d = r.data;
    if (d && d.endedAt !== null && d.startedAt >= from && d.startedAt <= now) n++;
  }
  let workingSets = 0;
  const ex = new Set<string>();
  for (const r of sets) {
    const s = r.data;
    if (!s || !doneWorking(s) || s.completedAt === null) continue;
    if (s.completedAt < from || s.completedAt > now) continue;
    workingSets++;
    ex.add(s.exId);
  }
  return { weekStart: from, sessions: n, workingSets, exercises: ex.size };
}
