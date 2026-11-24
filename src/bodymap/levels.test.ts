import { describe, it, expect } from "vitest";
import { PRIMARY_SET_WEIGHT, SECONDARY_SET_WEIGHT } from "../shared/domain";
import { displayStep, involvementLevels, volumeLevels, volumeStep } from "./levels";

describe("involvementLevels", () => {
  it("returns empty for no exercises", () => {
    expect(involvementLevels([])).toEqual({});
  });

  it("marks primary as 2 and secondary as 1", () => {
    expect(involvementLevels([{ primary: ["quads"], secondary: ["glutes"] }])).toEqual({ quads: 2, glutes: 1 });
  });

  it("primary wins over secondary regardless of order", () => {
    const a = involvementLevels([
      { primary: ["quads"], secondary: ["glutes"] },
      { primary: ["glutes"], secondary: ["quads"] },
    ]);
    const b = involvementLevels([
      { primary: ["glutes"], secondary: ["quads"] },
      { primary: ["quads"], secondary: ["glutes"] },
    ]);
    expect(a).toEqual({ quads: 2, glutes: 2 });
    expect(b).toEqual(a);
  });

  it("primary wins when listed as both in one exercise", () => {
    expect(involvementLevels([{ primary: ["chest"], secondary: ["chest", "triceps"] }])).toEqual({ chest: 2, triceps: 1 });
  });
});

describe("volumeLevels", () => {
  it("weights primary and secondary sets", () => {
    const r = volumeLevels([{ primary: ["hamstrings"], secondary: ["glutes"], sets: 4 }]);
    expect(r.hamstrings).toBe(4 * PRIMARY_SET_WEIGHT);
    expect(r.glutes).toBe(4 * SECONDARY_SET_WEIGHT);
  });

  it("sums across items", () => {
    const r = volumeLevels([
      { primary: ["quads", "glutes"], secondary: ["adductors"], sets: 4 },
      { primary: ["hamstrings", "glutes"], secondary: ["lower_back"], sets: 3 },
      { primary: ["hamstrings"], secondary: ["glutes"], sets: 2 },
    ]);
    expect(r).toEqual({
      quads: 4,
      glutes: 4 + 3 + 2 * SECONDARY_SET_WEIGHT,
      adductors: 4 * SECONDARY_SET_WEIGHT,
      hamstrings: 5,
      lower_back: 3 * SECONDARY_SET_WEIGHT,
    });
  });

  it("counts a muscle once (as primary) when listed in both", () => {
    expect(volumeLevels([{ primary: ["chest"], secondary: ["chest"], sets: 3 }])).toEqual({ chest: 3 });
  });

  it("ignores zero, negative and non-finite set counts", () => {
    expect(
      volumeLevels([
        { primary: ["quads"], secondary: [], sets: 0 },
        { primary: ["quads"], secondary: [], sets: -2 },
        { primary: ["quads"], secondary: [], sets: Number.NaN },
      ]),
    ).toEqual({});
  });
});

describe("volumeStep", () => {
  it.each([
    [undefined, 0],
    [0, 0],
    [0.5, 1],
    [2.9, 1],
    [3, 2],
    [5.5, 2],
    [6, 3],
    [9.9, 3],
    [10, 4],
    [25, 4],
  ] as const)("%s sets -> step %s", (sets, step) => {
    expect(volumeStep(sets)).toBe(step);
  });

  it("displayStep maps involvement levels", () => {
    expect(displayStep("involvement", 2)).toBe(2);
    expect(displayStep("involvement", 1)).toBe(1);
    expect(displayStep("involvement", undefined)).toBe(0);
    expect(displayStep("volume", 7)).toBe(3);
  });
});
