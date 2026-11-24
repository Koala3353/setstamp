// Relevance QA against the real generated catalog (≈1.4k rows). Skipped when the catalog has
// not been built. Expectations are about what a lifter typing the query wants to see first.

import { describe, expect, it } from "vitest";
import { MUSCLE_INFO, type CatalogExercise, type Muscle, type MuscleGroup } from "../shared/domain";
import { buildSearchIndex, search, type SearchOptions } from "./index";

// The generated catalog is git-ignored; the glob is empty when it has not been built.
const catalogFiles = import.meta.glob<CatalogExercise[]>("../../catalog/catalog.generated.json", {
  import: "default",
  eager: true,
});
const loaded = Object.values(catalogFiles)[0];
const HAVE = !!loaded;
const rows: CatalogExercise[] = (loaded ?? []).filter((r) => r.status === "active");

const t0 = performance.now();
const index = buildSearchIndex(rows);
const buildMs = performance.now() - t0;

const results = (q: string, opts?: SearchOptions) => search(index, q, { limit: 50, ...opts }).results.map((r) => r.exercise);
const ids = (q: string, opts?: SearchOptions) => results(q, opts).map((e) => e.exId);
const inGroup = (g: MuscleGroup) => (m: Muscle) => MUSCLE_INFO[m].group === g;

type Case = {
  q: string;
  /** Exact #1. */
  first?: string;
  /** Each must appear within the top `within` (default 3). */
  top?: string[];
  within?: number;
  /** [a, b]: a ranks above b. */
  before?: [string, string];
  /** Predicate over the top `all` results (default 10). */
  every?: (e: CatalogExercise) => boolean;
  all?: number;
  /** Ids that must NOT be #1. */
  notFirst?: string[];
};

const CASES: Case[] = [
  { q: "squat", top: ["ex_barbell_back_squat"] },
  { q: "squat", top: ["ex_front_squat"], within: 5 },
  { q: "squats", top: ["ex_barbell_back_squat"] },
  { q: "bench", first: "ex_barbell_bench_press" },
  { q: "bench", top: ["ex_dumbbell_bench_press"], within: 5 },
  { q: "bench press", first: "ex_barbell_bench_press" },
  { q: "benchpress", first: "ex_barbell_bench_press" },
  { q: "rdl", first: "ex_barbell_romanian_deadlift", top: ["ex_dumbbell_romanian_deadlift"] },
  { q: "romanian", first: "ex_barbell_romanian_deadlift" },
  { q: "romanain deadlift", first: "ex_barbell_romanian_deadlift" },
  { q: "db row", first: "ex_single_arm_dumbbell_row", every: (e) => e.equipment.includes("dumbbell"), all: 5 },
  {
    q: "dumbbell chest",
    every: (e) => e.equipment.includes("dumbbell") && e.primary.includes("chest"),
    top: ["ex_dumbbell_bench_press"],
  },
  { q: "leg press", first: "ex_leg_press", every: (e) => /leg press/i.test(e.name), all: 3 },
  { q: "no equipment", every: (e) => e.equipment.every((x) => x === "bodyweight"), all: 30 },
  {
    q: "no equipment legs",
    every: (e) => e.equipment.every((x) => x === "bodyweight") && e.primary.some(inGroup("legs")),
    all: 20,
  },
  { q: "no equipment legs", every: (e) => e.pattern !== "mobility" && e.tracking !== "duration", all: 5 },
  { q: "pullup", first: "ex_pull_up" },
  { q: "pull ups", first: "ex_pull_up" },
  { q: "pull-up", first: "ex_pull_up" },
  { q: "chin", first: "ex_chin_up" },
  { q: "chin ups", first: "ex_chin_up" },
  { q: "lat pull", first: "ex_lat_pulldown" },
  { q: "ohp", first: "ex_barbell_overhead_press" },
  { q: "shoulder press", top: ["ex_dumbbell_shoulder_press", "ex_machine_shoulder_press"], within: 4 },
  { q: "lateral raise", first: "ex_dumbbell_lateral_raise", top: ["ex_cable_lateral_raise"] },
  { q: "cable lateral", first: "ex_cable_lateral_raise" },
  { q: "face pull", first: "ex_face_pull" },
  { q: "hip thrust", first: "ex_barbell_hip_thrust" },
  { q: "bss", first: "ex_dumbbell_bulgarian_split_squat" },
  { q: "bulgarian", first: "ex_dumbbell_bulgarian_split_squat" },
  { q: "skull crusher", top: ["ex_barbell_skull_crusher", "ex_ez_bar_skull_crusher"] },
  { q: "skulls", top: ["ex_barbell_skull_crusher", "ex_ez_bar_skull_crusher"] },
  { q: "tricep pushdown", first: "ex_triceps_pushdown" },
  { q: "hammer curl", first: "ex_hammer_curl" },
  { q: "plank", first: "ex_plank", before: ["ex_plank", "ex_side_plank"] },
  { q: "side plank", first: "ex_side_plank" },
  { q: "calf", top: ["ex_standing_calf_raise", "ex_seated_calf_raise"], every: (e) => e.primary.includes("calves") },
  { q: "calf raise", top: ["ex_standing_calf_raise", "ex_seated_calf_raise"] },
  { q: "leg curl", top: ["ex_lying_leg_curl", "ex_seated_leg_curl"] },
  { q: "leg ext", first: "ex_leg_extension" },
  { q: "leg raise", top: ["ex_hanging_leg_raise"] },
  { q: "hack squat", first: "ex_hack_squat" },
  { q: "pendulum", first: "ex_pendulum_squat" },
  { q: "kb swing", first: "ex_kettlebell_swing" },
  { q: "farmer", first: "ex_farmers_walk" },
  { q: "farmers carry", first: "ex_farmers_walk" },
  { q: "dips", top: ["ex_chest_dip", "ex_triceps_dip"] },
  { q: "assisted pull", first: "ex_assisted_pull_up_machine" },
  { q: "smith", every: (e) => e.equipment.includes("smith"), top: ["ex_smith_machine_squat"], within: 5 },
  { q: "glute", every: (e) => e.primary.includes("glutes"), top: ["ex_barbell_hip_thrust"] },
  { q: "abs", every: (e) => e.primary.some(inGroup("core")) },
  { q: "back", every: (e) => e.primary.some(inGroup("back")), all: 5 },
  { q: "shoulders", every: (e) => e.primary.some(inGroup("shoulders")), all: 5 },
  { q: "bi", every: (e) => e.primary.includes("biceps"), all: 5 },
  { q: "tri", every: (e) => e.primary.includes("triceps"), all: 5 },
  { q: "ham", every: (e) => e.primary.includes("hamstrings"), all: 5 },
  { q: "chest", every: (e) => e.primary.includes("chest") },
  { q: "deadlift", first: "ex_barbell_deadlift" },
  { q: "front squat", first: "ex_front_squat" },
  { q: "incline", top: ["ex_incline_dumbbell_press", "ex_incline_barbell_bench_press"] },
  { q: "pec deck", first: "ex_pec_deck" },
  { q: "pec dec", first: "ex_pec_deck" },
  { q: "crunch", first: "ex_crunch", top: ["ex_cable_crunch"] },
  { q: "row", top: ["ex_barbell_row", "ex_seated_cable_row"], within: 5 },
  { q: "curl", top: ["ex_barbell_curl", "ex_dumbbell_curl"], within: 4 },
  { q: "dumbell curl", first: "ex_dumbbell_curl" },
  { q: "push up", first: "ex_push_up" },
  { q: "pushups", first: "ex_push_up" },
  { q: "ab wheel", first: "ex_ab_wheel_rollout" },
  { q: "rear delt", top: ["ex_reverse_pec_deck"] },
  { q: "air squat", first: "ex_bodyweight_squat" },
];

describe.skipIf(!HAVE)("real catalog relevance", () => {
  for (const c of CASES) {
    const label = [
      c.first && `#1 ${c.first}`,
      c.top && `top${c.within ?? 3} ⊇ ${c.top.join(",")}`,
      c.before && `${c.before[0]} > ${c.before[1]}`,
      c.every && `top${c.all ?? 10} predicate`,
    ]
      .filter(Boolean)
      .join("; ");
    it(`"${c.q}": ${label}`, () => {
      const r = results(c.q);
      const got = r.map((e) => e.exId);
      const show = r.slice(0, 10).map((e, i) => `${i + 1}. ${e.name}`).join("\n");
      expect(r.length, `no results for "${c.q}"`).toBeGreaterThan(0);
      if (c.first) expect(got[0], show).toBe(c.first);
      for (const id of c.top ?? []) expect(got.slice(0, c.within ?? 3), show).toContain(id);
      if (c.before) {
        const [a, b] = c.before.map((x) => got.indexOf(x));
        expect(a, show).toBeGreaterThanOrEqual(0);
        expect(b === -1 || a < b, show).toBe(true);
      }
      if (c.every) {
        const head = r.slice(0, c.all ?? 10);
        const bad = head.filter((e) => !c.every!(e)).map((e) => e.name);
        expect(bad, show).toEqual([]);
      }
    });
  }

  it("an obscure exercise's exact name ranks it #1 above staples", () => {
    for (const name of ["Gironda Sternum Chins", "Side To Side Chins", "Calf Press", "Bench Pull", "Squat Jerk"]) {
      const ex = rows.find((r) => r.name === name);
      expect(ex, name).toBeDefined();
      const r = search(index, name).results;
      expect(r[0].exercise.exId, name).toBe(ex!.exId);
      expect(r[0].matchKind).toBe("exact");
    }
  });

  it("equipment filter excludes non-matching rows even on an exact name", () => {
    const opts: SearchOptions = { filters: { equipment: ["dumbbell"] } };
    for (const q of ["Barbell Bench Press", "bench", "squat", "Leg Press", "pull up"]) {
      const r = results(q, opts);
      expect(r.every((e) => e.equipment.includes("dumbbell")), q).toBe(true);
      expect(ids(q, opts), q).not.toContain("ex_barbell_bench_press");
    }
    expect(results("bench", opts)[0].exId).toBe("ex_dumbbell_bench_press");
  });

  it("empty query browses staples first", () => {
    const r = search(index, "", { limit: 40 }).results;
    expect(r[0].matchKind).toBe("browse");
    expect(r.slice(0, 20).every((x) => x.exercise.commonness === 5)).toBe(true);
    const top40 = r.map((x) => x.exercise.exId);
    for (const id of ["ex_barbell_back_squat", "ex_barbell_bench_press", "ex_barbell_deadlift", "ex_pull_up"]) {
      expect(top40).toContain(id);
    }
  });

  it("performance: index build and per-query latency", () => {
    const queries = [...new Set(CASES.map((c) => c.q))];
    const times: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      for (const q of queries) {
        const s = performance.now();
        search(index, q);
        times.push(performance.now() - s);
      }
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(
      `[realCatalog perf] rows=${rows.length} build=${buildMs.toFixed(1)}ms avg=${avg.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${times[times.length - 1].toFixed(2)}ms over ${times.length} queries`,
    );
    expect(p95).toBeLessThan(50);
  });
});
