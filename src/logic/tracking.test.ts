import { describe, expect, it } from "vitest";
import type { SetData } from "../shared/sync";
import { formatLast, formatSetShort } from "./history";
import { bests, detectPRs, volumeLoad } from "./metrics";
import { canLog, isHold, isLoaded, isTimed, usesReps } from "./tracking";
import { generateWarmups } from "./warmup";

const s = (p: Partial<SetData>): SetData => ({
  sessionCid: "s1",
  sessionExerciseCid: "se1",
  exId: "ex",
  order: 0,
  kind: "working",
  weightKg: null,
  entered: null,
  reps: null,
  assistKg: null,
  durationSec: null,
  distanceM: null,
  rpe: null,
  done: true,
  completedAt: 1,
  ...p,
});

describe("tracking fields", () => {
  it("classifies the new types", () => {
    expect(isTimed("weight_duration")).toBe(true);
    expect(isHold("weight_duration")).toBe(true);
    expect(isLoaded("weight_duration")).toBe(true);
    expect(isLoaded("weight_distance")).toBe(true);
    expect(isTimed("weight_distance")).toBe(false);
    expect(usesReps("weight_duration")).toBe(false);
    expect(usesReps("bodyweight_reps")).toBe(true);
  });

  it("needs load and time / load and distance before logging", () => {
    expect(canLog(s({ weightKg: 20 }), "weight_duration")).toBe(false);
    expect(canLog(s({ weightKg: 20, durationSec: 45 }), "weight_duration")).toBe(true);
    expect(canLog(s({ weightKg: 40, durationSec: 30 }), "weight_distance")).toBe(false);
    expect(canLog(s({ weightKg: 40, distanceM: 30 }), "weight_distance")).toBe(true);
    expect(canLog(s({ durationSec: 30 }), "duration")).toBe(true);
    expect(canLog(s({ reps: 8 }), "weight_reps")).toBe(false);
    expect(canLog(s({ reps: 8 }), "bodyweight_reps")).toBe(true);
  });
});

describe("formatting the new types", () => {
  it("shows load × time and load × distance", () => {
    expect(formatSetShort(s({ weightKg: 20, entered: { value: 20, unit: "kg" }, durationSec: 45 }), "weight_duration", "kg")).toBe("20×45s");
    expect(formatSetShort(s({ weightKg: 40, entered: { value: 40, unit: "kg" }, distanceM: 30 }), "weight_distance", "kg")).toBe("40×30m");
    expect(formatSetShort(s({ weightKg: 40, entered: { value: 40, unit: "kg" } }), "weight_distance", "kg")).toBe("40×–");
    expect(formatSetShort(s({ durationSec: 95, distanceM: 400 }), "distance_time", "kg")).toBe("400m 95s");
    expect(formatSetShort(s({ durationSec: 95 }), "distance_time", "kg")).toBe("95s");
    expect(formatSetShort(s({ weightKg: 20 / 2.2046226218, entered: { value: 20, unit: "lb" }, durationSec: 30 }), "weight_duration", "lb")).toBe("20×30s");
  });
  it("leaves warm-ups out of Last time", () => {
    const sets = [s({ kind: "warmup", weightKg: 10, durationSec: 20 }), s({ weightKg: 20, durationSec: 40 })];
    expect(formatLast(sets, "weight_duration", "kg")).toBe("20×40s");
  });
});

describe("metrics for the new types", () => {
  it("never counts timed or carried sets as volume", () => {
    expect(volumeLoad([s({ weightKg: 20, durationSec: 60 })], "weight_duration")).toBe(0);
    expect(volumeLoad([s({ weightKg: 40, distanceM: 30 })], "weight_distance")).toBe(0);
  });

  it("no e1RM for holds or carries", () => {
    expect(bests([s({ weightKg: 20, durationSec: 60, reps: 1 })], "weight_duration").e1rm).toBeNull();
    expect(bests([s({ weightKg: 40, distanceM: 30, reps: 1 })], "weight_distance").e1rm).toBeNull();
  });

  it("weight + time: longest hold at a load, heaviest hold, warm-ups excluded", () => {
    const b = bests(
      [s({ weightKg: 20, durationSec: 45 }), s({ weightKg: 20, durationSec: 60 }), s({ weightKg: 30, durationSec: 20 }), s({ kind: "warmup", weightKg: 50, durationSec: 90 })],
      "weight_duration",
    );
    expect(b.longestAtLoad.get(20)).toBe(60);
    expect(b.heaviestHold).toEqual({ kg: 30, sec: 20 });
  });

  it("weight + time PRs: longer at the same load; heavier only if held at least as long", () => {
    const prior = [s({ weightKg: 20, durationSec: 45 }), s({ weightKg: 30, durationSec: 20 })];
    expect(detectPRs(prior, [s({ weightKg: 20, durationSec: 50 })], "weight_duration").map((p) => [p.kind, p.value, p.previous, p.atKg])).toEqual([
      ["longest_at_load", 50, 45, 20],
    ]);
    expect(detectPRs(prior, [s({ weightKg: 35, durationSec: 10 })], "weight_duration")).toEqual([]);
    const heavier = detectPRs(prior, [s({ weightKg: 35, durationSec: 20 })], "weight_duration");
    expect(heavier.map((p) => [p.kind, p.value, p.previous, p.atSec])).toEqual([["heaviest_hold", 35, 30, 20]]);
  });

  it("weight + distance PR is the best load × distance", () => {
    const prior = [s({ weightKg: 40, distanceM: 30 })]; // 1200
    expect(bests(prior, "weight_distance").loadDistance).toEqual({ kg: 40, m: 30, value: 1200 });
    expect(detectPRs(prior, [s({ weightKg: 30, distanceM: 40 })], "weight_distance")).toEqual([]);
    const pr = detectPRs(prior, [s({ weightKg: 50, distanceM: 30 })], "weight_distance");
    expect(pr.map((p) => [p.kind, p.value, p.previous])).toEqual([["load_distance", 1500, 1200]]);
  });

  it("first-ever logs are not PRs", () => {
    expect(detectPRs([], [s({ weightKg: 20, durationSec: 45 })], "weight_duration")).toEqual([]);
    expect(detectPRs([], [s({ weightKg: 40, distanceM: 30 })], "weight_distance")).toEqual([]);
  });
});

describe("warm-ups for loaded holds and carries", () => {
  const opts = { equipment: ["dumbbell" as const], barKg: 20, platesKg: [25, 20, 15, 10, 5, 2.5, 1.25], unit: "kg" as const };
  it("ramps loaded holds and carries like lifts", () => {
    expect(generateWarmups(30, { ...opts, tracking: "weight_distance" }).map((w) => w.weightKg)).toEqual([12, 18, 24]);
    expect(generateWarmups(30, { ...opts, tracking: "weight_duration" }).length).toBe(3);
    expect(generateWarmups(30, { ...opts, tracking: "distance_time" })).toEqual([]);
  });
});
