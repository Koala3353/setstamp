import { describe, expect, it } from "vitest";
import type { PlannedSlot, ProgramDay } from "../../shared/sync";
import {
  balanceNotes,
  canUseEquipment,
  completedCoverage,
  dayCoverage,
  dayVolume,
  estimateDayMinutes,
  exercisesForMuscle,
  suggestForMuscle,
  weekCoverage,
} from "./coverage";
import { FIXTURE, fixtureLookup as lookup } from "./fixture";

const slot = (exId: string, sets = 3, restSec: number | null = 120): PlannedSlot => ({
  slotId: exId,
  exId,
  sets,
  repMin: 8,
  repMax: 12,
  durationSec: null,
  restSec,
  warmup: false,
  notes: "",
  alternates: [],
});
const day = (name: string, ids: string[], sets = 3): ProgramDay => ({ dayId: name, name, slots: ids.map((i) => slot(i, sets)) });

// The generated catalog is git-ignored; when present, verify the fixture's mappings against it.
const catalogFiles = import.meta.glob<Array<Record<string, unknown>>>("../../../catalog/catalog.generated.json", { import: "default" });
const loadCatalog = Object.values(catalogFiles)[0];

describe("fixture matches the real catalog", () => {
  it.skipIf(!loadCatalog)("muscle mappings are copied verbatim", async () => {
    const cat = await loadCatalog!();
    for (const f of FIXTURE) {
      const row = cat.find((r) => r.exId === f.exId);
      expect(row, f.exId).toBeTruthy();
      expect({ p: row!.primary, s: row!.secondary, pat: row!.pattern, eq: row!.equipment }).toEqual({
        p: f.primary,
        s: f.secondary,
        pat: f.pattern,
        eq: f.equipment,
      });
    }
  });
});

describe("canUseEquipment", () => {
  it("treats an empty list as full gym and bodyweight as always available", () => {
    expect(canUseEquipment(["barbell", "bench"], [])).toBe(true);
    expect(canUseEquipment(["barbell", "bench"], ["barbell"])).toBe(false);
    expect(canUseEquipment(["bodyweight"], ["dumbbell"])).toBe(true);
  });
});

describe("dayCoverage", () => {
  it("updates as exercises are added and keeps primary over secondary", () => {
    const d = day("Lower", ["ex_barbell_back_squat"]);
    expect(dayCoverage(d, lookup)).toEqual({ quads: 2, glutes: 2, adductors: 1, lower_back: 1 });
    d.slots.push(slot("ex_barbell_romanian_deadlift"));
    const lv = dayCoverage(d, lookup);
    expect(lv.hamstrings).toBe(2);
    expect(lv.lower_back).toBe(1);
  });
  it("ignores unknown exercises", () => {
    expect(dayCoverage(day("x", ["ex_nope"]), lookup)).toEqual({});
  });
});

describe("weekCoverage / dayVolume", () => {
  it("counts primary 1 and secondary 0.5 per set across all days", () => {
    const p = { days: [day("A", ["ex_barbell_bench_press"]), day("B", ["ex_dumbbell_bench_press", "ex_triceps_pushdown"])] };
    const w = weekCoverage(p, lookup);
    expect(w.chest).toBe(6);
    expect(w.front_delts).toBe(3);
    expect(w.triceps).toBe(3 + 1.5 + 1.5);
    expect(dayVolume(p.days[0]!, lookup).triceps).toBe(1.5);
  });
});

describe("completedCoverage", () => {
  const now = 1_000_000_000_000;
  const set = (exId: string, kind: "warmup" | "working", done: boolean, ago: number) => ({
    exId,
    kind,
    done,
    completedAt: now - ago,
  });
  it("counts only done working sets in the last 7 days", () => {
    const sets = [
      set("ex_barbell_back_squat", "working", true, 1000),
      set("ex_barbell_back_squat", "working", true, 2000),
      set("ex_barbell_back_squat", "warmup", true, 3000),
      set("ex_barbell_back_squat", "working", false, 3000),
      set("ex_barbell_back_squat", "working", true, 8 * 24 * 3600 * 1000),
    ];
    expect(completedCoverage(sets, lookup, now)).toEqual({ quads: 2, glutes: 2, adductors: 1, lower_back: 1 });
  });
});

describe("exercisesForMuscle / suggestForMuscle", () => {
  const lower = day("Lower A", ["ex_barbell_back_squat", "ex_leg_press", "ex_barbell_romanian_deadlift"]);
  it("lists primary uses before secondary", () => {
    const uses = exercisesForMuscle("lower_back", [lower], lookup);
    expect(uses.map((u) => u.role)).toEqual(["secondary", "secondary"]);
    const ham = exercisesForMuscle("hamstrings", [lower], lookup);
    expect(ham[0]).toMatchObject({ role: "primary", exercise: { exId: "ex_barbell_romanian_deadlift" } });
  });
  it("suggests primary movers that fit the equipment, excluding exercises in the day", () => {
    const s = suggestForMuscle("hamstrings", FIXTURE, { available: ["dumbbell"], daySlots: lower.slots, lookup });
    const ids = s.map((x) => x.exercise.exId);
    expect(ids).toContain("ex_dumbbell_romanian_deadlift");
    expect(ids).not.toContain("ex_barbell_romanian_deadlift");
    expect(ids).not.toContain("ex_lying_leg_curl"); // machine not available
  });
  it("ranks a new movement pattern above another variant of one already in the day", () => {
    const s = suggestForMuscle("hamstrings", FIXTURE, { available: [], daySlots: lower.slots, lookup });
    // Leg curls (isolation_lower) beat the dumbbell RDL (same hinge pattern, same family).
    expect(s[0]!.exercise.pattern).toBe("isolation_lower");
  });
});

describe("estimateDayMinutes", () => {
  it("is sets × (rest + 40 s)", () => {
    expect(estimateDayMinutes(day("A", ["a", "b"], 3), 120)).toBe(Math.round((6 * 160) / 60));
    const d: ProgramDay = { dayId: "d", name: "d", slots: [{ ...slot("x", 4, null) }] };
    expect(estimateDayMinutes(d, 60)).toBe(Math.round((4 * 100) / 60));
  });
});

describe("balanceNotes", () => {
  it("notes secondary-only hamstrings from real catalog mappings", () => {
    // Catalog: back squat lists no hamstrings at all; glute bridge lists them as secondary.
    const p = { days: [day("Lower", ["ex_barbell_back_squat", "ex_glute_bridge"])] };
    const notes = balanceNotes(p, lookup, { defaultRestSec: 120, sessionMinutes: null });
    const ham = notes.find((n) => n.id === "gap-hamstrings");
    expect(ham?.text).toBe("No direct hamstrings work planned. Glute Bridge works hamstrings as a secondary muscle.");
  });
  it("reports press vs pull imbalance with neutral wording", () => {
    const p = {
      days: [day("Push", ["ex_barbell_bench_press", "ex_barbell_overhead_press", "ex_dumbbell_bench_press", "ex_push_up"]), day("Pull", ["ex_barbell_row", "ex_lat_pulldown"])],
    };
    const notes = balanceNotes(p, lookup, { defaultRestSec: 120, sessionMinutes: null });
    const r = notes.find((n) => n.id === "ratio-press-pull");
    expect(r?.text).toBe("Pressing 12 sets vs pulling 6 planned per week (counted by movement pattern).");
    for (const n of notes) expect(n.text).not.toMatch(/\bmust\b|\bshould\b|\bavoid\b/i);
    expect(notes.at(-1)?.id).toBe("overlap");
  });
  it("adds a gentle time note only when over the target", () => {
    const p = { days: [day("Long", ["ex_barbell_back_squat", "ex_leg_press", "ex_leg_extension", "ex_lying_leg_curl"], 5)] };
    const over = balanceNotes(p, lookup, { defaultRestSec: 120, sessionMinutes: 45 });
    expect(over.some((n) => n.kind === "time")).toBe(true);
    const ok = balanceNotes(p, lookup, { defaultRestSec: 120, sessionMinutes: 90 });
    expect(ok.some((n) => n.kind === "time")).toBe(false);
  });
  it("returns nothing for an empty program", () => {
    expect(balanceNotes({ days: [day("A", [])] }, lookup, { defaultRestSec: 90, sessionMinutes: 60 })).toEqual([]);
  });
});
