// Per-muscle numbers for the Progress muscle sheet. Pure functions: the UI passes in sets,
// session names and an exercise lookup.
//
// Same counting rule as coverage.ts: each done working set (warm-ups excluded) counts
// PRIMARY_SET_WEIGHT for a primary muscle and SECONDARY_SET_WEIGHT for a secondary one.
// An exercise listing the muscle as both counts it once, as primary. Sets whose exercise the
// lookup can't resolve are skipped. Weeks start Monday 00:00 local time, like the "This week" card.

import { PRIMARY_SET_WEIGHT, SECONDARY_SET_WEIGHT, type Muscle } from "../../shared/domain";
import type { SetData } from "../../shared/sync";
import { isCompletedWorkingSet, type ExerciseInfo, type ExerciseLookup } from "./coverage";

export type MuscleRole = "primary" | "secondary";

export type StatSet = Pick<SetData, "exId" | "kind" | "done" | "completedAt" | "sessionCid">;
export type SessionInfo = { name: string; startedAt: number };

/** Estimated sets split by role. `primarySets` / `secondarySets` are raw working-set counts. */
export type SetSplit = {
  /** primarySets × 1 + secondarySets × 0.5 */
  estimated: number;
  primarySets: number;
  secondarySets: number;
};

export type WeekBucket = SetSplit & { start: number };

export type TopExercise = { exId: string; name: string; role: MuscleRole; sets: number; estimated: number };

export type RecentSession = { sessionCid: string; name: string; at: number; sets: number; estimated: number };

export type MuscleStats = {
  muscle: Muscle;
  thisWeek: WeekBucket;
  lastWeek: WeekBucket;
  /** completedAt of the newest working set that counted for this muscle. */
  lastTrainedAt: number | null;
  /** Oldest first; the last bucket is the current (partial) week. */
  weeks: WeekBucket[];
  /** Exercises over the last `topDays` days, most estimated sets first. */
  topExercises: TopExercise[];
  /** Sessions that hit the muscle, newest first. */
  recentSessions: RecentSession[];
  /** False when no working set ever counted for this muscle. */
  hasAny: boolean;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of the Monday that starts `t`'s week (same rule as progress/model.ts). */
export function mondayOf(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Calendar days between two instants in local time (0 = same day). DST-safe. */
export function calendarDaysBetween(earlier: number, later: number): number {
  const a = new Date(earlier);
  const b = new Date(later);
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function roleOf(ex: Pick<ExerciseInfo, "primary" | "secondary">, muscle: Muscle): MuscleRole | null {
  if (ex.primary.includes(muscle)) return "primary";
  if (ex.secondary.includes(muscle)) return "secondary";
  return null;
}

const weightOf = (role: MuscleRole) => (role === "primary" ? PRIMARY_SET_WEIGHT : SECONDARY_SET_WEIGHT);
const emptySplit = (): SetSplit => ({ estimated: 0, primarySets: 0, secondarySets: 0 });
function add(split: SetSplit, role: MuscleRole): void {
  split.estimated += weightOf(role);
  if (role === "primary") split.primarySets++;
  else split.secondarySets++;
}

export type MuscleStatsOptions = {
  /** Weekly buckets in the trend, including the current week. Default 10. */
  weeks?: number;
  /** Window for top exercises, in days back from now. Default 28 (4 weeks). */
  topDays?: number;
  topLimit?: number;
  recentLimit?: number;
};

export function muscleStats(
  muscle: Muscle,
  sets: readonly StatSet[],
  sessionOf: (sessionCid: string) => SessionInfo | undefined,
  lookup: ExerciseLookup,
  now: number,
  opts: MuscleStatsOptions = {},
): MuscleStats {
  const nWeeks = Math.max(2, opts.weeks ?? 10);
  const topFrom = now - (opts.topDays ?? 28) * DAY_MS;

  // Week starts, oldest first. Step back from each Monday by one ms so DST weeks stay on Monday.
  const starts: number[] = [mondayOf(now)];
  while (starts.length < nWeeks) starts.unshift(mondayOf(starts[0]! - 1));
  const weeks: WeekBucket[] = starts.map((start) => ({ start, ...emptySplit() }));

  const roleCache = new Map<string, { role: MuscleRole; ex: ExerciseInfo } | null>();
  const resolve = (exId: string) => {
    if (!roleCache.has(exId)) {
      const ex = lookup(exId);
      const role = ex ? roleOf(ex, muscle) : null;
      roleCache.set(exId, ex && role ? { role, ex } : null);
    }
    return roleCache.get(exId)!;
  };

  let lastTrainedAt: number | null = null;
  const top = new Map<string, TopExercise>();
  const bySession = new Map<string, { sets: number; estimated: number; at: number }>();

  for (const s of sets) {
    if (!isCompletedWorkingSet(s) || s.completedAt == null || s.completedAt > now) continue;
    const hit = resolve(s.exId);
    if (!hit) continue;
    const at = s.completedAt;
    const w = weightOf(hit.role);

    if (lastTrainedAt === null || at > lastTrainedAt) lastTrainedAt = at;

    if (at >= starts[0]!) {
      let i = weeks.length - 1;
      while (i > 0 && at < weeks[i]!.start) i--;
      add(weeks[i]!, hit.role);
    }

    if (at >= topFrom) {
      // Keyed by the resolved exercise so merged catalog ids roll up together.
      const key = hit.ex.exId;
      const t = top.get(key) ?? { exId: key, name: hit.ex.name, role: hit.role, sets: 0, estimated: 0 };
      t.sets++;
      t.estimated += w;
      top.set(key, t);
    }

    const sess = bySession.get(s.sessionCid) ?? { sets: 0, estimated: 0, at };
    sess.sets++;
    sess.estimated += w;
    sess.at = Math.max(sess.at, at);
    bySession.set(s.sessionCid, sess);
  }

  const topExercises = [...top.values()]
    .sort((a, b) => b.estimated - a.estimated || b.sets - a.sets || a.name.localeCompare(b.name))
    .slice(0, opts.topLimit ?? 5);

  const recentSessions: RecentSession[] = [...bySession.entries()]
    .map(([sessionCid, v]) => {
      const info = sessionOf(sessionCid);
      return { sessionCid, name: info?.name || "Workout", at: info?.startedAt ?? v.at, sets: v.sets, estimated: v.estimated };
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, opts.recentLimit ?? 5);

  return {
    muscle,
    thisWeek: weeks[weeks.length - 1]!,
    lastWeek: weeks[weeks.length - 2]!,
    lastTrainedAt,
    weeks,
    topExercises,
    recentSessions,
    hasAny: lastTrainedAt !== null,
  };
}

/**
 * Catalog exercises that list `muscle` as primary, for the empty state. Most common first; among
 * equals, exercises with fewer primary muscles (more direct) first, then by name.
 */
export function starterExercises(muscle: Muscle, catalog: readonly ExerciseInfo[], limit = 3): ExerciseInfo[] {
  return catalog
    .filter((e) => (e.status ?? "active") === "active" && e.primary.includes(muscle))
    .sort(
      (a, b) =>
        (b.commonness ?? 0) - (a.commonness ?? 0) || a.primary.length - b.primary.length || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** Neutral week-over-week wording: "2.5 more than last week", "Same as last week". */
export function compareWeeks(thisWeek: number, lastWeek: number): string {
  const diff = Math.round((thisWeek - lastWeek) * 10) / 10;
  if (diff === 0) return "Same as last week";
  const n = fmtSets(Math.abs(diff));
  return diff > 0 ? `${n} more than last week` : `${n} fewer than last week`;
}

/** One decimal at most: 7.5, 8, 0.5. */
export function fmtSets(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Estimated sets per muscle for the current week, for every muscle in `muscles` (0 included). */
export function weekTotals(
  muscles: readonly Muscle[],
  levels: Partial<Record<Muscle, number>>,
): Array<{ muscle: Muscle; sets: number }> {
  return muscles
    .map((m, i) => ({ muscle: m, sets: levels[m] ?? 0, i }))
    .sort((a, b) => b.sets - a.sets || a.i - b.i)
    .map(({ muscle, sets }) => ({ muscle, sets }));
}
