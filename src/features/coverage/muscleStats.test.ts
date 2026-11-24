import { describe, expect, it } from "vitest";
import type { Muscle } from "../../shared/domain";
import { completedCoverage } from "./coverage";
import { FIXTURE, fixtureLookup as lookup } from "./fixture";
import {
  calendarDaysBetween,
  compareWeeks,
  mondayOf,
  muscleStats,
  starterExercises,
  weekTotals,
  type StatSet,
} from "./muscleStats";

// Wed 18 Nov 2026, 18:00 local. Monday of that week = 16 Nov.
const NOW = new Date(2026, 10, 18, 18, 0).getTime();
const at = (month: number, day: number, h = 10) => new Date(2026, month, day, h).getTime();

const set = (exId: string, completedAt: number | null, sessionCid = "s1", extra: Partial<StatSet> = {}): StatSet => ({
  exId,
  sessionCid,
  kind: "working",
  done: true,
  completedAt,
  ...extra,
});
const sessions: Record<string, { name: string; startedAt: number }> = {
  s1: { name: "Push A", startedAt: at(10, 17, 9) },
  s2: { name: "Pull A", startedAt: at(10, 10, 9) },
  s3: { name: "Push B", startedAt: at(10, 3, 9) },
};
const sessionOf = (cid: string) => sessions[cid];

describe("mondayOf / calendarDaysBetween", () => {
  it("finds local Monday midnight", () => {
    expect(mondayOf(NOW)).toBe(new Date(2026, 10, 16).getTime());
    expect(mondayOf(new Date(2026, 10, 22, 23).getTime())).toBe(new Date(2026, 10, 16).getTime()); // Sunday
    expect(mondayOf(new Date(2026, 10, 16, 0).getTime())).toBe(new Date(2026, 10, 16).getTime());
  });
  it("counts calendar days, not 24h blocks", () => {
    expect(calendarDaysBetween(at(10, 18, 1), NOW)).toBe(0);
    expect(calendarDaysBetween(at(10, 17, 23), NOW)).toBe(1);
    expect(calendarDaysBetween(at(9, 18), NOW)).toBe(31);
  });
});

describe("muscleStats", () => {
  const sets: StatSet[] = [
    // This week (s1, Tue 17 Nov): bench 3 sets (chest primary, triceps secondary), pushdown 2 (triceps primary)
    set("ex_barbell_bench_press", at(10, 17)),
    set("ex_barbell_bench_press", at(10, 17)),
    set("ex_barbell_bench_press", at(10, 17)),
    set("ex_triceps_pushdown", at(10, 17, 11)),
    set("ex_triceps_pushdown", at(10, 17, 11)),
    // Warm-up and undone sets never count
    set("ex_barbell_bench_press", at(10, 17), "s1", { kind: "warmup" }),
    set("ex_barbell_bench_press", at(10, 17), "s1", { done: false }),
    set("ex_barbell_bench_press", null),
    // Last week (s2, 10 Nov): push-ups 4 sets (chest + triceps primary)
    set("ex_push_up", at(10, 10), "s2"),
    set("ex_push_up", at(10, 10), "s2"),
    set("ex_push_up", at(10, 10), "s2"),
    set("ex_push_up", at(10, 10), "s2"),
    // Two weeks ago (s3, 3 Nov): dumbbell bench 2 sets
    set("ex_dumbbell_bench_press", at(10, 3), "s3"),
    set("ex_dumbbell_bench_press", at(10, 3), "s3"),
    // February: outside the trend and top-exercise windows, still a session that hit it
    set("ex_barbell_bench_press", at(1, 2), "old"),
    // Unknown exercise and a future set are ignored
    set("ex_unknown", at(10, 17)),
    set("ex_barbell_bench_press", NOW + 60_000),
  ];

  it("splits this week's estimate by role", () => {
    const s = muscleStats("triceps", sets, sessionOf, lookup, NOW);
    expect(s.thisWeek).toMatchObject({ estimated: 3.5, primarySets: 2, secondarySets: 3 });
    expect(s.lastWeek).toMatchObject({ estimated: 4, primarySets: 4, secondarySets: 0 });
  });

  it("matches completedCoverage for the current week", () => {
    const weekLevels = completedCoverage(
      sets.map((x) => ({ ...x })),
      lookup,
      NOW,
      NOW - mondayOf(NOW),
    );
    for (const m of ["chest", "triceps", "front_delts", "abs"] as Muscle[]) {
      expect(muscleStats(m, sets, sessionOf, lookup, NOW).thisWeek.estimated).toBeCloseTo(weekLevels[m] ?? 0);
    }
  });

  it("buckets weeks oldest first, current week last", () => {
    const s = muscleStats("chest", sets, sessionOf, lookup, NOW, { weeks: 4 });
    expect(s.weeks.map((w) => w.start)).toEqual([
      new Date(2026, 9, 26).getTime(),
      new Date(2026, 10, 2).getTime(),
      new Date(2026, 10, 9).getTime(),
      new Date(2026, 10, 16).getTime(),
    ]);
    expect(s.weeks.map((w) => w.estimated)).toEqual([0, 2, 4, 3]);
    expect(s.thisWeek).toBe(s.weeks[3]);
  });

  it("finds the last trained date and ignores sets after now", () => {
    const s = muscleStats("chest", sets, sessionOf, lookup, NOW);
    expect(s.lastTrainedAt).toBe(at(10, 17));
    expect(s.hasAny).toBe(true);
  });

  it("ranks top exercises in the last 4 weeks with role", () => {
    const s = muscleStats("triceps", sets, sessionOf, lookup, NOW);
    expect(s.topExercises).toEqual([
      { exId: "ex_push_up", name: "Push-Up", role: "primary", sets: 4, estimated: 4 },
      { exId: "ex_triceps_pushdown", name: "Triceps Pushdown", role: "primary", sets: 2, estimated: 2 },
      { exId: "ex_barbell_bench_press", name: "Barbell Bench Press", role: "secondary", sets: 3, estimated: 1.5 },
      { exId: "ex_dumbbell_bench_press", name: "Dumbbell Bench Press", role: "secondary", sets: 2, estimated: 1 },
    ]);
  });

  it("lists recent sessions newest first with names", () => {
    const s = muscleStats("chest", sets, sessionOf, lookup, NOW, { recentLimit: 3 });
    expect(s.recentSessions).toEqual([
      { sessionCid: "s1", name: "Push A", at: sessions.s1!.startedAt, sets: 3, estimated: 3 },
      { sessionCid: "s2", name: "Pull A", at: sessions.s2!.startedAt, sets: 4, estimated: 4 },
      { sessionCid: "s3", name: "Push B", at: sessions.s3!.startedAt, sets: 2, estimated: 2 },
    ]);
    // Unknown session falls back to "Workout" at its set time.
    const all = muscleStats("chest", sets, sessionOf, lookup, NOW, { recentLimit: 10 });
    expect(all.recentSessions.at(-1)).toMatchObject({ sessionCid: "old", name: "Workout", at: at(1, 2) });
  });

  it("is empty for a muscle never trained", () => {
    const s = muscleStats("calves", sets, sessionOf, lookup, NOW);
    expect(s.hasAny).toBe(false);
    expect(s.lastTrainedAt).toBeNull();
    expect(s.topExercises).toEqual([]);
    expect(s.recentSessions).toEqual([]);
    expect(s.weeks).toHaveLength(10);
    expect(s.weeks.every((w) => w.estimated === 0)).toBe(true);
  });

  it("does not break on exercises with tracking values it doesn't know", () => {
    const odd = (id: string) => (id === "ex_odd" ? { ...lookup("ex_leg_press")!, exId: "ex_odd", tracking: "weight_distance" as never } : lookup(id));
    const s = muscleStats("quads", [set("ex_odd", at(10, 17))], sessionOf, odd, NOW);
    expect(s.thisWeek.estimated).toBe(1);
  });
});

describe("starterExercises", () => {
  it("returns common primary-mover exercises, most direct first", () => {
    expect(starterExercises("calves", FIXTURE).map((e) => e.exId)).toEqual(["ex_standing_calf_raise", "ex_bodyweight_calf_raise"]);
    // Commonness 5 ties: single-primary Leg Extension before the two-primary squats/presses.
    expect(starterExercises("quads", FIXTURE)[0]!.exId).toBe("ex_leg_extension");
    expect(starterExercises("neck", FIXTURE)).toEqual([]);
  });
});

describe("compareWeeks / weekTotals", () => {
  it("words week-over-week change neutrally", () => {
    expect(compareWeeks(7.5, 5)).toBe("2.5 more than last week");
    expect(compareWeeks(3, 4)).toBe("1 fewer than last week");
    expect(compareWeeks(2, 2)).toBe("Same as last week");
  });
  it("sorts muscles by sets, ties in MUSCLES order", () => {
    expect(weekTotals(["chest", "lats", "abs"], { abs: 2, lats: 2, chest: 1 })).toEqual([
      { muscle: "lats", sets: 2 },
      { muscle: "abs", sets: 2 },
      { muscle: "chest", sets: 1 },
    ]);
  });
});
