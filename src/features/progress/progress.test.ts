import { describe, expect, it } from "vitest";
import type { Tracking } from "../../shared/domain";
import type { SessionData, SessionExerciseData, SetData } from "../../shared/sync";
import { buildSetsCsv, csvField, CSV_HEADER } from "../settings/csv";
import { localExport, withPendingOps } from "../settings/exportData";
import { layoutChart, niceStep } from "./chart";
import { exerciseSessions, loggedExercises, metricsFor, prCards, trendSeries, weeklySummary, weekStart, workoutHistory } from "./model";

const DAY = 24 * 60 * 60 * 1000;
// Wednesday 2026-11-25 12:00 local time.
const NOW = new Date(2026, 10, 25, 12, 0).getTime();

function set(p: Partial<SetData>): SetData {
  return {
    sessionCid: "s1",
    sessionExerciseCid: "se1",
    exId: "ex_bench",
    order: 0,
    kind: "working",
    weightKg: 100,
    entered: { value: 100, unit: "kg" },
    reps: 5,
    assistKg: null,
    durationSec: null,
    distanceM: null,
    rpe: null,
    done: true,
    completedAt: NOW,
    ...p,
  };
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
const row = <T>(data: T, cid = Math.random().toString(36).slice(2)) => ({
  cid,
  data,
});
const tracking = (map: Record<string, Tracking>) => (exId: string) => map[exId] ?? "weight_reps";

describe("csv", () => {
  it("escapes commas, quotes and newlines and neutralises formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line\nbreak")).toBe('"line\nbreak"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+1,2")).toBe('"\'+1,2"');
    expect(csvField(-20)).toBe("-20");
    expect(csvField(102.5)).toBe("102.5");
    expect(csvField(null)).toBe("");
  });

  it("writes one row per done set with the weight as entered", () => {
    const sessions = [session("s1", NOW - 3600_000, { name: "Push, heavy" })];
    const sx = [
      row<SessionExerciseData>(
        {
          sessionCid: "s1",
          exId: "ex_bench",
          order: 0,
          slotId: null,
          substitutedFromExId: null,
          notes: 'felt "easy"',
          restSec: null,
        },
        "se1",
      ),
    ];
    const sets = [
      row(
        set({
          order: 1,
          entered: { value: 225, unit: "lb" },
          weightKg: 102.06,
          reps: 5,
          rpe: 8,
        }),
      ),
      row(
        set({
          order: 0,
          kind: "warmup",
          entered: { value: 135, unit: "lb" },
          weightKg: 61.2,
        }),
      ),
      row(set({ order: 2, done: false })),
    ];
    const csv = buildSetsCsv({ sessions, sessionExercises: sx, sets }, () => "Bench press");
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(',"Push, heavy",Bench press,warmup,135,lb,5,,,,,"felt ""easy"""');
    expect(lines[2]).toContain(",working,225,lb,5,,,,8,");
  });

  it("falls back to kg when no entered value exists", () => {
    const csv = buildSetsCsv(
      {
        sessions: [session("s1", NOW)],
        sessionExercises: [],
        sets: [row(set({ entered: null, weightKg: 60 }))],
      },
      (id) => id,
    );
    expect(csv.split("\r\n")[1]).toContain(",ex_bench,working,60,kg,5,");
  });
});

describe("export helpers", () => {
  it("adds pending ops to a server export and builds an offline copy", () => {
    const out = withPendingOps({ format: "x", rows: [] }, []);
    expect(out.pendingOnThisDevice.ops).toEqual([]);
    const local = localExport(
      [
        {
          table: "sets",
          cid: "b",
          updatedAt: 1,
          deleted: false,
          seq: 0,
          data: null,
        },
        {
          table: "settings",
          cid: "a",
          updatedAt: 1,
          deleted: false,
          seq: 0,
          data: null,
        },
      ],
      [],
      NOW,
    );
    expect(local.rows.map((r) => r.table)).toEqual(["settings", "sets"]);
  });
});

describe("history and exercises", () => {
  const sessions = [session("old", NOW - 8 * DAY), session("new", NOW - DAY), session("open", NOW, { endedAt: null })];
  const sets = [
    row(
      set({
        sessionCid: "old",
        weightKg: 100,
        reps: 5,
        completedAt: NOW - 8 * DAY,
      }),
    ),
    row(
      set({
        sessionCid: "old",
        kind: "warmup",
        weightKg: 60,
        reps: 5,
        completedAt: NOW - 8 * DAY,
      }),
    ),
    row(
      set({
        sessionCid: "new",
        weightKg: 105,
        reps: 5,
        completedAt: NOW - DAY,
      }),
    ),
    row(
      set({
        sessionCid: "new",
        exId: "ex_pullup",
        weightKg: null,
        entered: null,
        assistKg: 20,
        reps: 8,
        completedAt: NOW - DAY,
      }),
    ),
    row(set({ sessionCid: "open", weightKg: 110, reps: 3 })),
  ];

  it("lists finished workouts newest first with working sets and volume (assisted excluded)", () => {
    const h = workoutHistory(sessions, sets, tracking({ ex_pullup: "assisted_reps" }));
    expect(h.map((x) => x.cid)).toEqual(["new", "old"]);
    expect(h[0]).toMatchObject({
      workingSets: 2,
      volumeKg: 525,
      exerciseCount: 2,
      durationSec: 3600,
    });
    expect(h[1]).toMatchObject({ workingSets: 1, volumeKg: 500 });
  });

  it("sorts logged exercises by recency", () => {
    const list = loggedExercises(sets, sessions);
    expect(list.map((e) => e.exId)).toEqual(["ex_bench", "ex_pullup"]);
    expect(list[0]).toMatchObject({ sessions: 3, workingSets: 3 });
  });

  it("builds PR cards from all-time bests", () => {
    const all = exerciseSessions("ex_bench", sessions, sets).flatMap((h) => h.sets);
    const cards = prCards(all, "weight_reps");
    expect(cards[0]).toMatchObject({ kind: "e1rm" });
    expect(cards[0]!.kind === "e1rm" && cards[0]!.kg).toBeCloseTo(105 * (1 + 5 / 30)); // 105×5 beats 110×3
    expect(cards.filter((c) => c.kind === "weight_at_reps")).toEqual([
      { kind: "weight_at_reps", reps: 3, kg: 110 },
      { kind: "weight_at_reps", reps: 5, kg: 105 },
    ]);
  });
});

describe("trend series", () => {
  const sessions = [session("a", NOW - 2 * DAY), session("b", NOW - DAY)];
  const sets = [
    row(set({ sessionCid: "a", weightKg: 100, reps: 5 })),
    row(set({ sessionCid: "a", weightKg: 140, reps: 5, kind: "warmup" })),
    row(set({ sessionCid: "a", weightKg: 90, reps: 10 })),
    row(set({ sessionCid: "b", weightKg: 102.5, reps: 3 })),
    row(set({ sessionCid: "b", weightKg: 80, reps: 15 })),
  ];
  const history = exerciseSessions("ex_bench", sessions, sets);

  it("one point per session, oldest first, warm-ups ignored", () => {
    const top = trendSeries(history, "top");
    expect(top.map((p) => [p.sessionCid, p.value])).toEqual([
      ["a", 100],
      ["b", 102.5],
    ]);
  });

  it("e1RM uses Epley on ≤10 reps only", () => {
    const e = trendSeries(history, "e1rm");
    expect(e[0]!.value).toBeCloseTo(120); // 90×10 = 120 beats 100×5 = 116.7
    expect(e[1]!.value).toBeCloseTo(102.5 * 1.1); // the 15-rep set is not used
  });

  it("assistance prefers the lowest value and picks metrics by tracking", () => {
    const h = [
      {
        sessionCid: "x",
        name: "",
        startedAt: 1,
        sets: [set({ assistKg: 30, reps: 8, weightKg: null }), set({ assistKg: 20, reps: 6, weightKg: null })],
      },
    ];
    expect(trendSeries(h, "assist")[0]!.value).toBe(20);
    expect(metricsFor("weight_reps")).toEqual(["top", "e1rm"]);
    expect(metricsFor("bodyweight_reps", [set({ weightKg: null })])).toEqual(["reps"]);
    expect(metricsFor("bodyweight_reps", [set({ weightKg: 10 })])).toEqual(["reps", "top", "e1rm"]);
    expect(metricsFor("duration")).toEqual(["hold"]);
    expect(metricsFor("weight_duration")).toEqual(["load", "hold"]);
    expect(metricsFor("weight_distance")).toEqual(["load", "carry"]);
  });

  it("weight + time and weight + distance get their own cards and trends, never e1RM or volume", () => {
    const holds = [set({ weightKg: 20, reps: null, durationSec: 60 }), set({ weightKg: 30, reps: null, durationSec: 20 })];
    expect(prCards(holds, "weight_duration")).toEqual([
      { kind: "heaviest_hold", kg: 30, sec: 20 },
      { kind: "longest_at_load", kg: 30, sec: 20 },
      { kind: "longest_at_load", kg: 20, sec: 60 },
    ]);
    const carries = [set({ weightKg: 40, entered: null, reps: null, distanceM: 30 }), set({ weightKg: 50, entered: null, reps: null, distanceM: 20 })];
    expect(prCards(carries, "weight_distance")).toEqual([{ kind: "load_distance", kg: 40, m: 30 }]);
    const h = [{ sessionCid: "x", name: "", startedAt: 1, sets: carries }];
    expect(trendSeries(h, "load")[0]!.value).toBe(50);
    expect(trendSeries(h, "carry")[0]!.value).toBe(1200);
    const csv = buildSetsCsv({ sessions: [session("s1", NOW)], sessionExercises: [], sets: [row(carries[0]!)] }, () => "Carry");
    expect(csv.split("\r\n")[1]).toContain(",Carry,working,40,kg,,,,30,,");
  });

  it("lays out points in the box with nice ticks", () => {
    expect(niceStep(17, 4)).toBe(5);
    const box = {
      width: 100,
      height: 100,
      padL: 10,
      padR: 10,
      padT: 10,
      padB: 10,
    };
    const l = layoutChart(
      [
        { at: 0, value: 100 },
        { at: 10, value: 117 },
      ],
      box,
    );
    expect(l.min).toBe(100);
    expect(l.max).toBe(120);
    expect(l.points[0]).toMatchObject({ x: 10, y: 90 });
    expect(l.points[1]!.x).toBe(90);
    const single = layoutChart([{ at: 5, value: 50 }], box);
    expect(single.points[0]!.x).toBe(50);
    expect(single.yTicks.length).toBeGreaterThan(1);
  });
});

describe("weekly summary", () => {
  it("counts Monday-to-now sessions and done working sets", () => {
    const monday = weekStart(NOW);
    expect(new Date(monday).getDay()).toBe(1);
    expect(new Date(monday).getHours()).toBe(0);
    const sessions = [session("lastweek", monday - DAY), session("mon", monday + 3600_000), session("open", NOW - 1000, { endedAt: null })];
    const sets = [
      row(set({ sessionCid: "lastweek", completedAt: monday - DAY })),
      row(set({ sessionCid: "mon", completedAt: monday + 3700_000 })),
      row(
        set({
          sessionCid: "mon",
          kind: "warmup",
          completedAt: monday + 3700_000,
        }),
      ),
      row(
        set({
          sessionCid: "mon",
          exId: "ex_row",
          completedAt: monday + 3800_000,
        }),
      ),
      row(set({ sessionCid: "mon", done: false, completedAt: null })),
    ];
    expect(weeklySummary(sessions, sets, NOW)).toEqual({
      weekStart: monday,
      sessions: 1,
      workingSets: 2,
      exercises: 2,
    });
  });

  it("treats Sunday as the end of the week", () => {
    const sunday = new Date(2026, 10, 29, 20, 0).getTime();
    expect(weekStart(sunday)).toBe(new Date(2026, 10, 23).getTime());
  });
});
