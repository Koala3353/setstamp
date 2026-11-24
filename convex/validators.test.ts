import { describe, expect, test } from "vitest";
import { checkValue, vCustomExerciseData, vProgramData, vSessionExerciseData, vSetData } from "./validators";

const se = {
  sessionCid: "s1",
  exId: "ex_bench_press",
  order: 0,
  slotId: null,
  substitutedFromExId: null,
  notes: "",
  restSec: null,
};

const slot = {
  slotId: "slot1",
  exId: "ex_bench_press",
  sets: 3,
  repMin: 6,
  repMax: 10,
  durationSec: null,
  restSec: 120,
  warmup: false,
  notes: "",
  alternates: [],
};

const program = (s: Record<string, unknown>) => ({
  name: "P",
  template: "custom",
  days: [{ dayId: "d1", name: "Day 1", slots: [s] }],
  nextDayIndex: 0,
  preferredWeekdays: [],
  archived: false,
  scheduleLog: [],
});

describe("validators: supersets", () => {
  test("session exercises written before supersets (no groupId) still validate", () => {
    expect(checkValue(vSessionExerciseData, se)).toBeNull();
  });
  test("session exercises accept a groupId or null", () => {
    expect(checkValue(vSessionExerciseData, { ...se, groupId: "g1" })).toBeNull();
    expect(checkValue(vSessionExerciseData, { ...se, groupId: null })).toBeNull();
    expect(checkValue(vSessionExerciseData, { ...se, groupId: 3 })).not.toBeNull();
  });
  test("program slots validate with and without groupId", () => {
    expect(checkValue(vProgramData, program(slot))).toBeNull();
    expect(checkValue(vProgramData, program({ ...slot, groupId: "g1" }))).toBeNull();
    expect(checkValue(vProgramData, program({ ...slot, groupId: null }))).toBeNull();
    expect(checkValue(vProgramData, program({ ...slot, groupId: false }))).not.toBeNull();
  });
});

describe("validators: tracking types", () => {
  const custom = {
    exId: "cx_1",
    name: "Weighted plank",
    aliases: [],
    equipment: ["other"],
    primary: ["abs"],
    secondary: [],
    pattern: "core_anti_extension",
    tracking: "weight_reps",
    unilateral: false,
    notes: "",
  };
  test("old and new tracking values are accepted; unknown ones are not", () => {
    for (const tracking of ["weight_reps", "bodyweight_reps", "assisted_reps", "duration", "distance_time", "weight_duration", "weight_distance"]) {
      expect(checkValue(vCustomExerciseData, { ...custom, tracking })).toBeNull();
    }
    expect(checkValue(vCustomExerciseData, { ...custom, tracking: "weight_time" })).not.toBeNull();
  });
  test("a weight + distance set uses existing fields", () => {
    const set = {
      sessionCid: "s1",
      sessionExerciseCid: "se1",
      exId: "ex_farmers_walk",
      order: 0,
      kind: "working",
      weightKg: 40,
      entered: { value: 40, unit: "kg" },
      reps: null,
      assistKg: null,
      durationSec: null,
      distanceM: 30,
      rpe: null,
      done: true,
      completedAt: 1,
    };
    expect(checkValue(vSetData, set)).toBeNull();
  });
});
