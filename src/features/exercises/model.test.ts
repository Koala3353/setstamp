import { describe, expect, it } from "vitest";
import type { SearchableExercise } from "../../search";
import { canDo, deriveUsage, isStaple, isUsual, rankSubstitutes, recentExIds, resolveExId, type UsageSet } from "./model";
import type { CatalogExercise } from "../../shared/domain";

const ex = (o: Partial<SearchableExercise> & { exId: string }): SearchableExercise => ({
  name: o.exId,
  aliases: [],
  equipment: ["barbell"],
  primary: [],
  secondary: [],
  pattern: "squat",
  family: null,
  tracking: "weight_reps",
  commonness: 3,
  ...o,
});

describe("deriveUsage (measured usage)", () => {
  const set = (exId: string, sessionCid: string, done: boolean, completedAt: number | null): UsageSet => ({
    exId,
    sessionCid,
    done,
    completedAt,
  });

  it("counts distinct sessions with completed sets, not sets", () => {
    const u = deriveUsage([
      set("bench", "s1", true, 100),
      set("bench", "s1", true, 110),
      set("bench", "s2", true, 200),
      set("bench", "s3", false, null),
    ]);
    expect(u.frequency.bench).toBe(2);
    expect(u.recent.bench).toBe(200);
  });

  it("ignores undone sets entirely", () => {
    const u = deriveUsage([set("squat", "s1", false, 500)]);
    expect(u.frequency.squat).toBeUndefined();
    expect(u.recent.squat).toBeUndefined();
  });

  it("falls back to updatedAt when completedAt is missing", () => {
    const u = deriveUsage([
      {
        exId: "row",
        sessionCid: "s1",
        done: true,
        completedAt: null,
        updatedAt: 42,
      },
    ]);
    expect(u.recent.row).toBe(42);
  });

  it("keeps 'usual' (measured) separate from 'staple' (curated)", () => {
    const u = deriveUsage([1, 2, 3].map((i) => set("curl", `s${i}`, true, i)));
    expect(isUsual(u, "curl")).toBe(true);
    expect(isUsual(u, "bench")).toBe(false);
    expect(isStaple({ commonness: 5 })).toBe(true);
    expect(isStaple({ commonness: 2 })).toBe(false);
    expect(isStaple({ commonness: 5, custom: true })).toBe(false);
  });

  it("orders recent exercises newest first", () => {
    const u = deriveUsage([set("a", "s1", true, 10), set("b", "s2", true, 30), set("c", "s3", true, 20)]);
    expect(recentExIds(u)).toEqual(["b", "c", "a"]);
  });
});

describe("rankSubstitutes", () => {
  const target = ex({
    exId: "back_squat",
    family: "squat",
    pattern: "squat",
    primary: ["quads", "glutes"],
    secondary: ["adductors"],
  });
  const front = ex({
    exId: "front_squat",
    family: "squat",
    pattern: "squat",
    primary: ["quads"],
    secondary: ["glutes"],
  });
  const goblet = ex({
    exId: "goblet",
    family: "squat_goblet",
    pattern: "squat",
    equipment: ["dumbbell"],
    primary: ["quads", "glutes"],
  });
  const legPress = ex({
    exId: "leg_press",
    pattern: "isolation_lower",
    equipment: ["machine"],
    primary: ["quads", "glutes"],
  });
  const curl = ex({
    exId: "curl",
    pattern: "isolation_upper",
    equipment: ["dumbbell"],
    primary: ["biceps"],
  });

  it("excludes the target and unrelated exercises", () => {
    const ids = rankSubstitutes(target, [target, front, goblet, legPress, curl]).map((s) => s.exercise.exId);
    expect(ids).not.toContain("back_squat");
    expect(ids).not.toContain("curl");
  });

  it("ranks same family/pattern + overlapping primaries first", () => {
    const ids = rankSubstitutes(target, [legPress, goblet, front]).map((s) => s.exercise.exId);
    expect(ids.indexOf("front_squat")).toBeLessThan(ids.indexOf("leg_press"));
    expect(ids.indexOf("goblet")).toBeLessThan(ids.indexOf("leg_press"));
  });

  it("prefers equipment the user has", () => {
    const res = rankSubstitutes(target, [front, goblet], {
      availableEquipment: ["dumbbell"],
    });
    expect(res[0]!.exercise.exId).toBe("goblet");
    const frontSub = res.find((s) => s.exercise.exId === "front_squat")!;
    expect(frontSub.available).toBe(false);
    expect(frontSub.why).toContain("needs barbell");
  });

  it("explains why", () => {
    const [g] = rankSubstitutes(target, [goblet]);
    expect(g!.why).toBe("Same movement · hits quads, glutes");
    const [f] = rankSubstitutes(target, [front]);
    expect(f!.why).toBe("Same family · hits quads");
  });

  it("uses measured usage only as a tie-breaker", () => {
    const a = ex({ exId: "a", pattern: "squat", primary: ["quads", "glutes"] });
    const b = ex({ exId: "b", pattern: "squat", primary: ["quads", "glutes"] });
    const usage = { recent: {}, frequency: { b: 10 } };
    expect(rankSubstitutes(target, [a, b], { usage })[0]!.exercise.exId).toBe("b");
    // A heavily used but unrelated-pattern exercise doesn't beat a family match.
    expect(
      rankSubstitutes(target, [legPress, front], {
        usage: { recent: {}, frequency: { leg_press: 50 } },
      })[0]!.exercise.exId,
    ).toBe("front_squat");
  });

  it("treats empty available equipment as a full gym", () => {
    expect(canDo(front, [])).toBe(true);
    expect(canDo(ex({ exId: "pushup", equipment: ["bodyweight"] }), ["dumbbell"])).toBe(true);
  });
});

describe("resolveExId", () => {
  it("follows merge chains", () => {
    const m = new Map<string, CatalogExercise>([
      ["old", { exId: "old", status: "merged", mergedInto: "mid" } as CatalogExercise],
      ["mid", { exId: "mid", status: "merged", mergedInto: "new" } as CatalogExercise],
      ["new", { exId: "new", status: "active", mergedInto: null } as CatalogExercise],
    ]);
    expect(resolveExId("old", m)).toBe("new");
    expect(resolveExId("unknown", m)).toBe("unknown");
  });
});
