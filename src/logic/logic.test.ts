import { describe, expect, it } from "vitest";
import { LB_PER_KG, toKg } from "../shared/domain";
import type { SessionData, SetData } from "../shared/sync";
import { formatLast, previousPerformance } from "./history";
import { detectPRs, epley, volumeLoad } from "./metrics";
import { platesPerSide, roundDownToLoadable, roundToLoadable } from "./plates";
import { progressionHint } from "./progression";
import { displayWeight, fromEntered, roundTo, smallestIncrement } from "./units";
import { generateWarmups } from "./warmup";

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function set(p: Partial<SetData>): SetData {
  return {
    sessionCid: "s1",
    sessionExerciseCid: "se1",
    exId: "ex_bench",
    order: 0,
    kind: "working",
    weightKg: 100,
    entered: { value: 100, unit: "kg" },
    reps: 8,
    assistKg: null,
    durationSec: null,
    distanceM: null,
    rpe: null,
    done: true,
    completedAt: 1,
    ...p,
  };
}
const sess = (startedAt: number, endedAt: number | null): SessionData => ({ startedAt, endedAt, name: "W", programCid: null, dayId: null, notes: "", bodyweightKg: null });

describe("units", () => {
  it("preserves the entered value in its own unit", () => {
    const w = fromEntered(45, "lb");
    expect(w.weightKg).toBeCloseTo(45 / LB_PER_KG, 9);
    expect(displayWeight(w, "lb")).toBe(45);
  });
  it("converts and rounds when the unit differs, without rewriting the row", () => {
    const w = fromEntered(100, "kg");
    expect(displayWeight(w, "lb")).toBe(220.5);
    expect(w.entered).toEqual({ value: 100, unit: "kg" });
    expect(displayWeight({ weightKg: toKg(225, "lb"), entered: null }, "lb")).toBe(225);
  });
  it("rounds to increments and picks implement increments", () => {
    expect(roundTo(102.4, 2.5)).toBe(102.5);
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(smallestIncrement(["barbell"], "kg")).toBe(2.5);
    expect(smallestIncrement(["barbell"], "lb")).toBe(5);
    expect(smallestIncrement(["dumbbell"], "kg")).toBe(2);
  });
});

describe("e1RM", () => {
  it("uses Epley for 2–10 reps, flagged as an estimate", () => {
    expect(epley(100, 10)).toEqual({ kg: 100 * (1 + 10 / 30), estimated: true });
    expect(epley(100, 1)).toEqual({ kg: 100, estimated: false });
  });
  it("refuses sets outside 1–10 reps", () => {
    expect(epley(100, 11)).toBeNull();
    expect(epley(100, 0)).toBeNull();
    expect(epley(null, 5)).toBeNull();
  });
});

describe("volume load", () => {
  it("counts done working sets only", () => {
    const sets = [set({ kind: "warmup", weightKg: 60, reps: 5 }), set({}), set({ reps: 7 }), set({ done: false })];
    expect(volumeLoad(sets)).toBe(100 * 8 + 100 * 7);
  });
  it("excludes assisted sets", () => {
    expect(volumeLoad([set({ weightKg: null, assistKg: 20, reps: 8 })], "assisted_reps")).toBe(0);
    expect(volumeLoad([set({ weightKg: null, assistKg: 20, reps: 8 })])).toBe(0);
  });
});

describe("PR detection", () => {
  const prior = [set({ sessionCid: "a", weightKg: 100, reps: 8 }), set({ sessionCid: "a", weightKg: 100, reps: 8 })];
  it("flags heaviest weight at a rep count and best e1RM (estimated)", () => {
    const prs = detectPRs(prior, [set({ sessionCid: "b", weightKg: 102.5, reps: 8 })], "weight_reps");
    expect(prs.find((p) => p.kind === "weight_at_reps")).toMatchObject({ reps: 8, value: 102.5, previous: 100 });
    expect(prs.find((p) => p.kind === "e1rm")?.estimated).toBe(true);
  });
  it("ignores warm-ups and first-ever logs", () => {
    expect(detectPRs(prior, [set({ kind: "warmup", weightKg: 140, reps: 8 })], "weight_reps")).toEqual([]);
    expect(detectPRs([], [set({ weightKg: 140 })], "weight_reps")).toEqual([]);
  });
  it("most reps for bodyweight, least assistance, longest hold", () => {
    expect(detectPRs([set({ weightKg: null, reps: 10 })], [set({ weightKg: null, reps: 12 })], "bodyweight_reps")[0]).toMatchObject({ kind: "most_reps", value: 12 });
    expect(detectPRs([set({ weightKg: null, assistKg: 30, reps: 8 })], [set({ weightKg: null, assistKg: 25, reps: 8 })], "assisted_reps")[0]).toMatchObject({ kind: "least_assist", value: 25 });
    expect(detectPRs([set({ assistKg: 30, reps: 8, weightKg: null })], [set({ assistKg: 25, reps: 6, weightKg: null })], "assisted_reps")).toEqual([]);
    expect(detectPRs([set({ durationSec: 60 })], [set({ durationSec: 75 })], "duration")[0]).toMatchObject({ kind: "longest_duration", value: 75 });
  });
  it("best session volume", () => {
    const cur = [set({ sessionCid: "b" }), set({ sessionCid: "b" }), set({ sessionCid: "b", reps: 2 })];
    expect(detectPRs(prior, cur, "weight_reps").map((p) => p.kind)).toContain("session_volume");
  });
});

describe("previous performance", () => {
  const sessions = [
    { cid: "old", data: sess(1, 2) },
    { cid: "new", data: sess(10, 20) },
    { cid: "open", data: sess(30, null) },
  ];
  const sets = [
    { cid: "1", data: set({ sessionCid: "old", weightKg: 90, entered: { value: 90, unit: "kg" as const } }) },
    { cid: "2", data: set({ sessionCid: "new", order: 1, reps: 7 }) },
    { cid: "3", data: set({ sessionCid: "new", order: 0 }) },
    { cid: "4", data: set({ sessionCid: "open", weightKg: 200 }) },
    { cid: "5", data: set({ sessionCid: "new", exId: "ex_other" }) },
  ];
  it("returns the last completed session's sets for the same exercise, in order", () => {
    const p = previousPerformance("ex_bench", sessions, sets, "open");
    expect(p?.sessionCid).toBe("new");
    expect(p?.sets.map((s) => s.reps)).toEqual([8, 7]);
    expect(formatLast(p!.sets, "weight_reps", "kg")).toBe("100×8, 100×7");
  });
  it("returns null when never done", () => {
    expect(previousPerformance("ex_none", sessions, sets)).toBeNull();
  });
});

describe("double progression", () => {
  it("suggests the smallest increment when every set hits repMax at one weight", () => {
    const h = progressionHint([set({ reps: 10 }), set({ reps: 10 }), set({ reps: 10 })], 8, 10, 2.5, "kg");
    expect(h.action).toBe("increase");
    expect(h.suggest?.value).toBe(102.5);
    expect(h.rule).toMatch(/add 2.5 kg/);
  });
  it("holds when any set is below repMin", () => {
    expect(progressionHint([set({ reps: 10 }), set({ reps: 7 })], 8, 10, 2.5, "kg").action).toBe("hold");
  });
  it("asks for reps when in range, and uses lb increments in lb", () => {
    expect(progressionHint([set({ reps: 9 }), set({ reps: 10 })], 8, 10, 2.5, "kg").action).toBe("add_reps");
    const lb = fromEntered(225, "lb");
    const h = progressionHint([set({ ...lb, reps: 10 }), set({ ...lb, reps: 10 })], 8, 10, 5, "lb");
    expect(h.suggest?.value).toBe(230);
  });
  it("ignores warm-ups", () => {
    expect(progressionHint([set({ kind: "warmup", reps: 3 }), set({ reps: 10 })], 8, 10, 2.5, "kg").action).toBe("increase");
  });
});

describe("plate calculator", () => {
  it("loads per side", () => {
    expect(platesPerSide(100, 20, KG_PLATES)).toMatchObject({ perSide: [25, 15], loadedKg: 100, remainderKg: 0 });
    expect(platesPerSide(62.5, 20, KG_PLATES).perSide).toEqual([20, 1.25]);
  });
  it("reports a remainder when not loadable", () => {
    const r = platesPerSide(101, 20, KG_PLATES);
    expect(r.loadedKg).toBe(100);
    expect(r.remainderKg).toBeCloseTo(1, 6);
    expect(platesPerSide(15, 20, KG_PLATES).belowBar).toBe(true);
  });
  it("rounds to loadable weights", () => {
    expect(roundDownToLoadable(43, 20, KG_PLATES)).toBe(42.5);
    expect(roundToLoadable(44, 20, KG_PLATES)).toBe(45);
  });
});

describe("warm-ups", () => {
  const opts = { tracking: "weight_reps" as const, equipment: ["barbell" as const], barKg: 20, platesKg: KG_PLATES, unit: "kg" as const };
  it("ramps bar×10, 40/60/80% rounded down to plates", () => {
    expect(generateWarmups(100, opts)).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 3 },
      { weightKg: 80, reps: 1 },
    ]);
    expect(generateWarmups(102.5, opts)[1]).toEqual({ weightKg: 40, reps: 5 });
  });
  it("skips bodyweight, timed and bar-only work", () => {
    expect(generateWarmups(100, { ...opts, tracking: "bodyweight_reps" })).toEqual([]);
    expect(generateWarmups(100, { ...opts, tracking: "duration" })).toEqual([]);
    expect(generateWarmups(20, opts)).toEqual([]);
  });
  it("collapses duplicate light steps", () => {
    const w = generateWarmups(40, opts);
    expect(new Set(w.map((s) => s.weightKg)).size).toBe(w.length);
  });
  it("rounds dumbbell steps to the dumbbell increment", () => {
    expect(generateWarmups(30, { ...opts, equipment: ["dumbbell"] }).map((s) => s.weightKg)).toEqual([12, 18, 24]);
  });
});

describe("number formatting", () => {
  it("groups thousands and trims trailing zeros the same way everywhere", async () => {
    const { fmtNum, fmtInt } = await import("./units");
    expect(fmtNum(3660)).toBe("3,660");
    expect(fmtNum(102.5)).toBe("102.5");
    expect(fmtNum(45)).toBe("45");
    expect(fmtNum(20.4117)).toBe("20.41");
    expect(fmtNum(null)).toBe("–");
    expect(fmtInt(2519.6)).toBe("2,520");
    expect(fmtInt(-0.2)).toBe("0");
  });
});
