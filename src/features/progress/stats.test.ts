import { describe, expect, it } from "vitest";
import type { Muscle, Tracking } from "../../shared/domain";
import type { SessionData, SetData } from "../../shared/sync";
import {
  addDays,
  bodyweightSeries,
  buckets,
  buildStatsIndex,
  e1rmSeries,
  groupSplit,
  isStatsRange,
  mostTrained,
  overview,
  prTimeline,
  prsIn,
  rangeWindow,
  topLifts,
  trainingCalendar,
  weeklyStreak,
} from "./stats";
import { weekStart } from "./model";

// Wednesday 2026-11-25 12:00 local time.
const NOW = new Date(2026, 10, 25, 12, 0).getTime();
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m, d, h, 0).getTime();

let seq = 0;
function set(sessionCid: string, p: Partial<SetData> = {}) {
  const data: SetData = {
    sessionCid,
    sessionExerciseCid: "se",
    exId: "ex_bench",
    order: seq++,
    kind: "working",
    weightKg: 100,
    entered: { value: 100, unit: "kg" },
    reps: 5,
    assistKg: null,
    durationSec: null,
    distanceM: null,
    rpe: null,
    done: true,
    completedAt: null,
    ...p,
  };
  return { cid: `set${seq}`, data };
}
function session(cid: string, startedAt: number, p: Partial<SessionData> = {}) {
  const data: SessionData = {
    startedAt,
    endedAt: startedAt + 3600_000,
    name: `W ${cid}`,
    programCid: null,
    dayId: null,
    notes: "",
    bodyweightKg: null,
    ...p,
  };
  return { cid, data };
}
const tracking = (map: Record<string, Tracking>) => (exId: string) => map[exId] ?? "weight_reps";

describe("empty data", () => {
  const idx = buildStatsIndex([], [], tracking({}));
  it("every stat has a zero state", () => {
    const win = rangeWindow(idx, "all", NOW);
    expect(win.weeks).toBe(1);
    expect(win.from).toBe(weekStart(NOW));
    expect(overview(idx, win)).toEqual({ workouts: 0, workingSets: 0, volumeKg: 0, timeSec: 0, avgSessionSec: null, perWeek: 0, weeks: 1 });
    expect(weeklyStreak(idx, NOW)).toEqual({ weeks: 0, includesThisWeek: false });
    expect(buckets(idx, win).list).toHaveLength(1);
    expect(trainingCalendar(idx, NOW, 12).activeDays).toBe(0);
    expect(groupSplit(idx, win, () => undefined)).toEqual({ groups: [], unmapped: 0, total: 0 });
    expect(prTimeline(idx)).toEqual([]);
    expect(mostTrained(idx, win)).toEqual([]);
    expect(topLifts(idx, win)).toEqual([]);
    expect(bodyweightSeries(idx, win)).toEqual([]);
  });
});

describe("single session", () => {
  const sessions = [session("a", at(2026, 10, 24))];
  const sets = [
    set("a", { kind: "warmup", weightKg: 60, reps: 10 }),
    set("a", { weightKg: 100, reps: 5 }),
    set("a", { weightKg: 100, reps: 5 }),
    set("a", { weightKg: 100, reps: 5, done: false }),
  ];
  const idx = buildStatsIndex(sessions, sets, tracking({}));
  const win = rangeWindow(idx, "4w", NOW);

  it("excludes warm-ups and undone sets from sets and volume", () => {
    const o = overview(idx, win);
    expect(o.workouts).toBe(1);
    expect(o.workingSets).toBe(2);
    expect(o.volumeKg).toBe(1000);
    expect(o.timeSec).toBe(3600);
    expect(o.avgSessionSec).toBe(3600);
    expect(o.perWeek).toBe(0.25);
  });
  it("a first log is not a record", () => {
    expect(prTimeline(idx)).toEqual([]);
  });
  it("streak counts this week", () => {
    expect(weeklyStreak(idx, NOW)).toEqual({ weeks: 1, includesThisWeek: true });
  });
});

describe("rows that should not count", () => {
  it("skips unfinished sessions and sets whose session is gone (deleted)", () => {
    const sessions = [session("a", at(2026, 10, 23)), session("open", at(2026, 10, 24), { endedAt: null })];
    const sets = [set("a"), set("open"), set("deleted-session"), { cid: "tomb", data: null }];
    const idx = buildStatsIndex(sessions, sets, tracking({}));
    const o = overview(idx, rangeWindow(idx, "all", NOW));
    expect(o.workouts).toBe(1);
    expect(o.workingSets).toBe(1);
  });
  it("skips zero-length sessions from time but still counts the workout", () => {
    const sessions = [session("a", at(2026, 10, 23)), session("b", at(2026, 10, 24), { endedAt: at(2026, 10, 24) })];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    const o = overview(idx, rangeWindow(idx, "4w", NOW));
    expect(o.workouts).toBe(2);
    expect(o.timeSec).toBe(3600);
    expect(o.avgSessionSec).toBe(3600);
  });
});

describe("units and tracking types", () => {
  it("volume is stored in kg whatever unit was typed", () => {
    const sessions = [session("a", at(2026, 10, 23))];
    const sets = [set("a", { weightKg: 102.058, entered: { value: 225, unit: "lb" }, reps: 5 })];
    const idx = buildStatsIndex(sessions, sets, tracking({}));
    expect(overview(idx, rangeWindow(idx, "4w", NOW)).volumeKg).toBeCloseTo(510.29, 2);
  });
  it("timed, carried and assisted sets count as sets but add no volume", () => {
    const sessions = [session("a", at(2026, 10, 23))];
    const sets = [
      set("a", { exId: "hold", weightKg: 40, reps: null, durationSec: 30 }),
      set("a", { exId: "carry", weightKg: 32, reps: null, distanceM: 40 }),
      set("a", { exId: "plank", weightKg: null, reps: null, durationSec: 60 }),
      set("a", { exId: "pullup_a", weightKg: null, assistKg: 20, reps: 8 }),
    ];
    const t = tracking({ hold: "weight_duration", carry: "weight_distance", plank: "duration", pullup_a: "assisted_reps" });
    const idx = buildStatsIndex(sessions, sets, t);
    const o = overview(idx, rangeWindow(idx, "4w", NOW));
    expect(o.workingSets).toBe(4);
    expect(o.volumeKg).toBe(0);
  });
});

describe("records", () => {
  const t = tracking({ hold: "weight_duration", carry: "weight_distance", dips: "bodyweight_reps" });
  const sessions = [session("a", at(2026, 9, 1)), session("b", at(2026, 9, 8)), session("c", at(2026, 10, 20))];
  const sets = [
    set("a", { weightKg: 100, reps: 5 }),
    set("a", { weightKg: 90, reps: 8 }),
    set("a", { exId: "hold", weightKg: 40, reps: null, durationSec: 30 }),
    set("a", { exId: "carry", weightKg: 30, reps: null, distanceM: 40 }),
    set("a", { exId: "dips", weightKg: null, reps: 12 }),
    // b: heavier single, more reps at 90 kg; longer hold at 40 kg; nothing new on carry
    set("b", { weightKg: 110, reps: 1 }),
    set("b", { weightKg: 90, reps: 10 }),
    set("b", { exId: "hold", weightKg: 40, reps: null, durationSec: 45 }),
    set("b", { exId: "carry", weightKg: 30, reps: null, distanceM: 40 }),
    set("b", { exId: "dips", weightKg: null, reps: 15 }),
    // c: warm-up heavier than anything must not count; carry PR
    set("c", { kind: "warmup", weightKg: 140, reps: 1 }),
    set("c", { exId: "carry", weightKg: 32, reps: null, distanceM: 40 }),
  ];
  const idx = buildStatsIndex(sessions, sets, t);
  const tl = prTimeline(idx);

  it("lists moments newest first, one per exercise per workout", () => {
    expect(tl.map((m) => `${m.sessionCid}:${m.exId}`)).toEqual(["c:carry", "b:dips", "b:ex_bench", "b:hold"]);
  });
  it("finds heaviest, e1RM (estimated) and reps at a weight", () => {
    const bench = tl.find((m) => m.exId === "ex_bench")!;
    const kinds = Object.fromEntries(bench.events.map((e) => [e.kind, e]));
    expect(kinds.heaviest).toMatchObject({ value: 110, previous: 100 });
    // 90 × 10 → 120 beats 100 × 5 → 116.67 and 90 × 8 → 114
    expect(kinds.e1rm!.value).toBeCloseTo(120);
    expect(kinds.e1rm!.estimated).toBe(true);
    expect(kinds.reps_at_weight).toMatchObject({ value: 10, previous: 8, atKg: 90 });
  });
  it("handles holds at a load and load × distance", () => {
    expect(tl.find((m) => m.exId === "hold")!.events[0]).toMatchObject({ kind: "longest_at_load", value: 45, previous: 30, atKg: 40 });
    expect(tl.find((m) => m.exId === "carry")!.events[0]).toMatchObject({ kind: "load_distance", value: 1280, previous: 1200 });
    expect(tl.find((m) => m.exId === "dips")!.events[0]).toMatchObject({ kind: "most_reps", value: 15, previous: 12 });
  });
  it("filters to the range but compares with all history", () => {
    const win = rangeWindow(idx, "4w", NOW);
    expect(prsIn(tl, win).map((m) => m.exId)).toEqual(["carry"]);
  });
  it("e1RM series and top lifts skip non-rep exercises", () => {
    const win = rangeWindow(idx, "all", NOW);
    expect(e1rmSeries(idx, "ex_bench", win).map((p) => Math.round(p.value))).toEqual([117, 120]);
    expect(e1rmSeries(idx, "hold", win)).toEqual([]);
    expect(topLifts(idx, win)).toEqual(["ex_bench"]);
  });
});

describe("weeks and streaks (Monday start, local time)", () => {
  it("counts back from last week when this week is still empty", () => {
    // Weeks of Nov 16, Nov 9, (gap) Oct 26. Today is Wed Nov 25 with nothing logged.
    const sessions = [session("a", at(2026, 10, 16, 7)), session("b", at(2026, 10, 15, 23)), session("c", at(2026, 9, 27))];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    expect(weeklyStreak(idx, NOW)).toEqual({ weeks: 2, includesThisWeek: false });
  });
  it("Sunday night and Monday morning fall in different weeks", () => {
    const sessions = [session("sun", at(2026, 10, 22, 23)), session("mon", at(2026, 10, 23, 0))];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    const b = buckets(idx, rangeWindow(idx, "4w", NOW));
    expect(b.unit).toBe("week");
    expect(b.list.map((x) => x.workouts)).toEqual([0, 0, 1, 1]);
    expect(b.list[3]!.current).toBe(true);
  });
  it("ranges are whole calendar weeks; long all-time ranges bucket by month", () => {
    const sessions = [session("old", at(2024, 0, 10)), session("new", at(2026, 10, 24))];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    expect(rangeWindow(idx, "12w", NOW).weeks).toBe(12);
    expect(rangeWindow(idx, "1y", NOW).from).toBe(addDays(weekStart(NOW), -51 * 7));
    const all = buckets(idx, rangeWindow(idx, "all", NOW));
    expect(all.unit).toBe("month");
    expect(all.list).toHaveLength(35); // Jan 2024 … Nov 2026
    expect(all.list.reduce((n, b) => n + b.workouts, 0)).toBe(2);
  });
  it("calendar has 7 days per week, ends this week and marks future days", () => {
    const sessions = [session("a", at(2026, 10, 24)), session("b", at(2026, 10, 24, 7))];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    const cal = trainingCalendar(idx, NOW, 12);
    expect(cal.days).toHaveLength(84);
    expect(cal.activeDays).toBe(1);
    expect(cal.days.find((d) => d.workouts > 0)!.workouts).toBe(2);
    expect(cal.days.filter((d) => d.future)).toHaveLength(4); // Thu … Sun
    expect(new Date(cal.days[0]!.at).getDay()).toBe(1);
  });
});

describe("muscle groups and exercises", () => {
  const muscles: Record<string, { primary: Muscle[]; secondary: Muscle[] }> = {
    ex_bench: { primary: ["chest"], secondary: ["triceps", "front_delts"] },
    row: { primary: ["lats", "upper_back"], secondary: ["biceps"] },
  };
  const sessions = [session("a", at(2026, 10, 23)), session("b", at(2026, 10, 24))];
  const sets = [set("a"), set("a"), set("a", { exId: "row" }), set("b", { exId: "row" }), set("b", { exId: "mystery" })];
  const idx = buildStatsIndex(sessions, sets, tracking({}));
  const win = rangeWindow(idx, "4w", NOW);

  it("counts a set once per group at its strongest role", () => {
    const split = groupSplit(idx, win, (id) => muscles[id]);
    const by = Object.fromEntries(split.groups.map((g) => [g.group, g.sets]));
    expect(by).toEqual({ chest: 2, back: 2, arms: 2, shoulders: 1 });
    expect(split.unmapped).toBe(1);
    expect(split.total).toBe(5);
  });
  it("ranks most-trained exercises with workouts and last date", () => {
    expect(mostTrained(idx, win)).toEqual([
      { exId: "ex_bench", sets: 2, workouts: 1, lastAt: at(2026, 10, 23) },
      { exId: "row", sets: 2, workouts: 2, lastAt: at(2026, 10, 24) },
      { exId: "mystery", sets: 1, workouts: 1, lastAt: at(2026, 10, 24) },
    ].sort((a, b) => b.sets - a.sets || b.lastAt - a.lastAt));
  });
});

describe("bodyweight", () => {
  it("only sessions with a recorded bodyweight", () => {
    const sessions = [session("a", at(2026, 10, 2), { bodyweightKg: 80 }), session("b", at(2026, 10, 9)), session("c", at(2026, 10, 16), { bodyweightKg: 79.5 })];
    const idx = buildStatsIndex(sessions, [], tracking({}));
    expect(bodyweightSeries(idx, rangeWindow(idx, "all", NOW)).map((p) => p.value)).toEqual([80, 79.5]);
  });
});

describe("range parsing", () => {
  it("accepts only known ranges", () => {
    expect(isStatsRange("12w")).toBe(true);
    expect(isStatsRange("2w")).toBe(false);
    expect(isStatsRange(null)).toBe(false);
  });
});

describe("performance", () => {
  it("2,000 sessions / 60,000 sets stays fast", () => {
    const exIds = Array.from({ length: 40 }, (_, i) => `ex_${i}`);
    const sessions = [];
    const sets = [];
    let t = NOW - 2000 * 2 * 86_400_000;
    for (let i = 0; i < 2000; i++) {
      t += 2 * 86_400_000;
      const cid = `s${i}`;
      sessions.push(session(cid, t, { bodyweightKg: i % 3 ? null : 80 + (i % 7) }));
      for (let j = 0; j < 30; j++) {
        sets.push(set(cid, { exId: exIds[(i * 3 + Math.floor(j / 5)) % 40]!, weightKg: 50 + (i % 50) + j, reps: 3 + (j % 8), kind: j % 10 === 0 ? "warmup" : "working" }));
      }
    }
    const musclesOf = () => ({ primary: ["chest" as Muscle], secondary: ["triceps" as Muscle] });
    const start = performance.now();
    const idx = buildStatsIndex(sessions, sets, tracking({}));
    const tl = prTimeline(idx);
    for (const r of ["4w", "12w", "1y", "all"] as const) {
      const win = rangeWindow(idx, r, NOW);
      overview(idx, win);
      buckets(idx, win);
      groupSplit(idx, win, musclesOf);
      prsIn(tl, win);
      mostTrained(idx, win);
      for (const ex of topLifts(idx, win)) e1rmSeries(idx, ex, win);
      bodyweightSeries(idx, win);
    }
    weeklyStreak(idx, NOW);
    trainingCalendar(idx, NOW, 26);
    const ms = performance.now() - start;
    expect(idx.sessions).toHaveLength(2000);
    expect(ms).toBeLessThan(1500);
  });
});
