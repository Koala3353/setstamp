// Split templates and the rule-based starter-exercise picker.
// Rule: for each slot spec, take the active catalog exercise that matches the spec's movement
// pattern and primary muscle, fits the user's equipment (empty list = full gym), and suits the
// slot's tracking (reps vs hold). Rank first against near-duplicates of an exercise already in
// the same day (same variant family on the same implement, e.g. rope pushdown after pushdown),
// then by curated commonness, compound-vs-isolation fit, exercises not already used elsewhere
// in the program, and name. No AI, fully deterministic.

import { isHold, usesReps } from "../../logic/tracking";
import type { Equipment, Muscle, Pattern } from "../../shared/domain";
import type { PlannedSlot, ProgramData, ProgramDay } from "../../shared/sync";
import { canUseEquipment, type ExerciseInfo } from "../coverage/coverage";

export type TemplateId = "upper_lower" | "ppl3" | "ppl6" | "full_body" | "ul_ppl" | "bro" | "custom";

export type SlotSpec = {
  /** What the slot is for, shown if nothing fits ("Vertical pull"). */
  label: string;
  patterns: Pattern[];
  muscle: Muscle;
  mechanic: "compound" | "isolation";
  sets: number;
  repMin: number | null;
  repMax: number | null;
  /** Hold slots (e.g. plank) use seconds instead of reps. */
  durationSec?: number;
};

export type DaySpec = { name: string; focus: string; slots: SlotSpec[] };

export type TemplateDef = {
  id: TemplateId;
  name: string;
  meta: string;
  /** ProgramData.template value. */
  kind: ProgramData["template"];
  days: DaySpec[];
};

const c = (label: string, patterns: Pattern[], muscle: Muscle, sets: number, repMin: number, repMax: number): SlotSpec => ({
  label,
  patterns,
  muscle,
  mechanic: "compound",
  sets,
  repMin,
  repMax,
});
const iso = (label: string, patterns: Pattern[], muscle: Muscle, sets: number, repMin: number, repMax: number): SlotSpec => ({
  label,
  patterns,
  muscle,
  mechanic: "isolation",
  sets,
  repMin,
  repMax,
});
const core = (label: string): SlotSpec => ({
  label,
  patterns: ["core_anti_extension", "core_flexion"],
  muscle: "abs",
  mechanic: "isolation",
  sets: 2,
  repMin: 8,
  repMax: 15,
});

const S = {
  hPush: c("Horizontal press", ["horizontal_push"], "chest", 3, 6, 10),
  hPush2: c("Second press", ["horizontal_push"], "chest", 3, 8, 12),
  vPush: c("Overhead press", ["vertical_push"], "front_delts", 3, 6, 10),
  hPull: c("Row", ["horizontal_pull"], "upper_back", 3, 8, 12),
  vPull: c("Vertical pull", ["vertical_pull"], "lats", 3, 6, 12),
  squat: c("Squat pattern", ["squat"], "quads", 3, 5, 8),
  squat2: c("Leg press or squat", ["squat"], "quads", 3, 8, 12),
  hinge: c("Hinge", ["hinge"], "hamstrings", 3, 6, 10),
  hipThrust: c("Glute hinge", ["hinge"], "glutes", 3, 8, 12),
  lunge: c("Single-leg", ["lunge"], "quads", 2, 8, 12),
  biceps: iso("Biceps", ["isolation_upper"], "biceps", 2, 10, 15),
  triceps: iso("Triceps", ["isolation_upper"], "triceps", 2, 10, 15),
  sideDelt: iso("Side delts", ["isolation_upper"], "side_delts", 3, 12, 20),
  rearDelt: c("Rear delts", ["horizontal_pull", "isolation_upper"], "rear_delts", 2, 12, 20),
  quadIso: iso("Quads", ["isolation_lower"], "quads", 2, 10, 15),
  hamIso: iso("Hamstring curl", ["isolation_lower"], "hamstrings", 3, 10, 15),
  calves: iso("Calves", ["isolation_lower"], "calves", 3, 10, 15),
  chestIso: iso("Chest fly", ["isolation_upper"], "chest", 2, 10, 15),
  core: core("Core"),
  // Bro split: one muscle group a day, so more work per muscle in that session.
  hPush3: c("Third press", ["horizontal_push"], "chest", 3, 10, 12),
  vPull2: c("Second pull", ["vertical_pull"], "lats", 3, 8, 12),
  vPush2: c("Second shoulder press", ["vertical_push"], "front_delts", 3, 8, 12),
  shrug: iso("Traps", ["isolation_upper"], "traps", 3, 10, 15),
  armBiceps: iso("Biceps", ["isolation_upper"], "biceps", 3, 8, 12),
  armTriceps: iso("Triceps", ["isolation_upper"], "triceps", 3, 8, 12),
} satisfies Record<string, SlotSpec>;

const PUSH = [S.hPush, S.vPush, S.hPush2, S.sideDelt, S.triceps, S.triceps];
const PULL = [S.vPull, S.hPull, S.hPull, S.rearDelt, S.biceps, S.biceps];
const LEGS = [S.squat, S.hinge, S.quadIso, S.hamIso, S.calves];

export const TEMPLATES: TemplateDef[] = [
  {
    id: "upper_lower",
    name: "Upper / Lower",
    meta: "4 days · 3–5 sessions a week",
    kind: "upper_lower",
    days: [
      { name: "Upper A", focus: "Horizontal press and row, arms", slots: [S.hPush, S.hPull, S.vPush, S.vPull, S.biceps, S.triceps] },
      { name: "Lower A", focus: "Squat pattern, hamstrings, calves", slots: [S.squat, S.hinge, S.lunge, S.hamIso, S.calves] },
      { name: "Upper B", focus: "Vertical press and pull, shoulders", slots: [S.vPush, S.vPull, S.hPush2, S.hPull, S.sideDelt, S.rearDelt] },
      { name: "Lower B", focus: "Hinge pattern, quads, core", slots: [S.hinge, S.squat2, S.hipThrust, S.quadIso, S.calves, S.core] },
    ],
  },
  {
    id: "ppl3",
    name: "Push / Pull / Legs",
    meta: "3 days · run once or twice a week",
    kind: "ppl",
    days: [
      { name: "Push", focus: "Chest, shoulders, triceps", slots: PUSH },
      { name: "Pull", focus: "Back, rear delts, biceps", slots: PULL },
      { name: "Legs", focus: "Quads, hamstrings, glutes, calves", slots: LEGS },
    ],
  },
  {
    id: "ppl6",
    name: "Push / Pull / Legs × 2",
    meta: "6 days · A and B variations",
    kind: "ppl",
    days: [
      { name: "Push A", focus: "Chest, shoulders, triceps", slots: PUSH },
      { name: "Pull A", focus: "Back, rear delts, biceps", slots: PULL },
      { name: "Legs A", focus: "Squat focus", slots: LEGS },
      { name: "Push B", focus: "Shoulders first, chest fly", slots: [S.vPush, S.hPush2, S.chestIso, S.sideDelt, S.triceps] },
      { name: "Pull B", focus: "Rows first, arms", slots: [S.hPull, S.vPull, S.rearDelt, S.biceps, S.biceps] },
      { name: "Legs B", focus: "Hinge focus, core", slots: [S.hinge, S.squat2, S.hipThrust, S.calves, S.core] },
    ],
  },
  {
    id: "full_body",
    name: "Full body",
    meta: "3 days · 2–3 sessions a week",
    kind: "full_body",
    days: [
      { name: "Full body A", focus: "Squat, horizontal press, row", slots: [S.squat, S.hPush, S.hPull, S.biceps, S.core] },
      { name: "Full body B", focus: "Hinge, vertical press, pull-up", slots: [S.hinge, S.vPush, S.vPull, S.triceps, S.calves] },
      { name: "Full body C", focus: "Lunge, second press, accessories", slots: [S.lunge, S.hPush2, S.hPull, S.sideDelt, S.hamIso] },
    ],
  },
  {
    id: "ul_ppl",
    name: "Upper / Lower + Push / Pull / Legs",
    meta: "5 days · upper and lower, then push, pull, legs",
    kind: "upper_lower",
    days: [
      { name: "Upper", focus: "Press and row, arms", slots: [S.hPush, S.hPull, S.vPush, S.vPull, S.biceps, S.triceps] },
      { name: "Lower", focus: "Squat, hinge, single-leg", slots: [S.squat, S.hinge, S.lunge, S.hamIso, S.calves] },
      { name: "Push", focus: "Chest, shoulders, triceps", slots: PUSH },
      { name: "Pull", focus: "Back, rear delts, biceps", slots: PULL },
      { name: "Legs", focus: "Quads, glutes, hamstrings, core", slots: [S.squat2, S.hipThrust, S.quadIso, S.hamIso, S.calves, S.core] },
    ],
  },
  {
    id: "bro",
    name: "Bro split",
    meta: "5 days · one muscle group a day",
    kind: "custom",
    days: [
      { name: "Chest", focus: "Presses and a fly", slots: [S.hPush, S.hPush2, S.hPush3, S.chestIso] },
      { name: "Back", focus: "Vertical pulls and rows", slots: [S.vPull, S.hPull, S.hPull, S.vPull2] },
      { name: "Shoulders", focus: "Overhead press, delts, traps", slots: [S.vPush, S.vPush2, S.sideDelt, S.rearDelt, S.shrug] },
      { name: "Legs", focus: "Squat, hinge, quads, hamstrings, calves", slots: [S.squat, S.hinge, S.squat2, S.quadIso, S.hamIso, S.calves] },
      { name: "Arms", focus: "Biceps and triceps", slots: [S.armBiceps, S.armTriceps, S.armBiceps, S.armTriceps, S.armBiceps, S.armTriceps] },
    ],
  },
  { id: "custom", name: "Custom", meta: "Name your own days and fill them", kind: "custom", days: [] },
];

const REP_TRACKING = new Set(["weight_reps", "bodyweight_reps", "assisted_reps"]);

/** Best catalog exercise for a slot spec, or null when nothing fits the equipment. */
export function pickForSpec(
  spec: SlotSpec,
  catalog: readonly ExerciseInfo[],
  available: readonly Equipment[],
  used: ReadonlySet<string> = new Set(),
  sameDay: readonly ExerciseInfo[] = [],
): ExerciseInfo | null {
  let best: { ex: ExerciseInfo; key: number[] } | null = null;
  for (const ex of catalog) {
    if (ex.status && ex.status !== "active") continue;
    if (!spec.patterns.includes(ex.pattern) || !ex.primary.includes(spec.muscle)) continue;
    if (!canUseEquipment(ex.equipment, available)) continue;
    const isHold = ex.tracking === "duration";
    if (spec.durationSec ? !isHold : !REP_TRACKING.has(ex.tracking)) continue;
    const key = [
      sameDay.some((d) => isNearDuplicate(ex, d)) ? 0 : 1,
      ex.commonness ?? 0,
      ex.mechanic === spec.mechanic ? 1 : 0,
      used.has(ex.exId) ? 0 : 1,
      ex.primary[0] === spec.muscle ? 1 : 0,
    ];
    if (!best || compareKeys(key, best.key) > 0 || (compareKeys(key, best.key) === 0 && ex.name.localeCompare(best.ex.name) < 0)) {
      best = { ex, key };
    }
  }
  return best?.ex ?? null;
}

/** Equipment that says nothing about how a variant differs (a pushdown and a skull crusher both may use a bench). */
const GENERIC_EQUIPMENT = new Set<Equipment>(["bodyweight", "bench"]);

/**
 * Two exercises are near-duplicates when they share a variant family and a real implement:
 * Rope Triceps Pushdown and Triceps Pushdown (both cable), not Pushdown and Skull Crusher.
 */
export function isNearDuplicate(a: Pick<ExerciseInfo, "exId" | "family" | "equipment">, b: Pick<ExerciseInfo, "exId" | "family" | "equipment">): boolean {
  if (a.exId === b.exId) return true;
  if (!a.family || a.family !== b.family) return false;
  return a.equipment.some((e) => !GENERIC_EQUIPMENT.has(e) && b.equipment.includes(e));
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

export function restForSpec(spec: Pick<SlotSpec, "mechanic">): number {
  return spec.mechanic === "compound" ? 150 : 90;
}

export type BuiltProgram = { data: ProgramData; unfilled: Array<{ day: string; label: string }> };

/**
 * Build a program from a template. Within a day an exercise is never repeated and near-duplicate
 * variants lose to a different movement; across the program unused exercises win ties, so A/B
 * days get some variety.
 */
export function buildFromTemplate(
  id: TemplateId,
  catalog: readonly ExerciseInfo[],
  available: readonly Equipment[],
  makeId: () => string,
): BuiltProgram {
  const tpl = TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[TEMPLATES.length - 1]!;
  const used = new Set<string>();
  const unfilled: BuiltProgram["unfilled"] = [];
  const days: ProgramDay[] = tpl.days.map((d) => {
    const slots: PlannedSlot[] = [];
    const inDay = new Set<string>();
    const dayPicks: ExerciseInfo[] = [];
    let firstCompound = true;
    for (const spec of d.slots) {
      const pool = catalog.filter((e) => !inDay.has(e.exId));
      const ex = pickForSpec(spec, pool, available, used, dayPicks);
      if (!ex) {
        unfilled.push({ day: d.name, label: spec.label });
        continue;
      }
      inDay.add(ex.exId);
      dayPicks.push(ex);
      used.add(ex.exId);
      const hold = isHold(ex.tracking);
      slots.push({
        slotId: makeId(),
        exId: ex.exId,
        sets: spec.sets,
        repMin: hold ? null : spec.repMin,
        repMax: hold ? null : spec.repMax,
        durationSec: hold ? (spec.durationSec ?? 30) : null,
        restSec: restForSpec(spec),
        warmup: spec.mechanic === "compound" && firstCompound,
        notes: "",
        alternates: [],
      });
      if (spec.mechanic === "compound") firstCompound = false;
    }
    return { dayId: makeId(), name: d.name, slots };
  });
  return {
    data: {
      name: tpl.id === "custom" ? "My program" : tpl.name,
      template: tpl.kind,
      days: tpl.id === "custom" ? [{ dayId: makeId(), name: "Day 1", slots: [] }] : days,
      nextDayIndex: 0,
      preferredWeekdays: [],
      archived: false,
      scheduleLog: [],
    },
    unfilled,
  };
}

/** A blank slot for an exercise the user picked. */
export function newSlot(ex: Pick<ExerciseInfo, "exId" | "tracking" | "mechanic">, slotId: string): PlannedSlot {
  const hold = isHold(ex.tracking);
  // Carries and timed cardio have no rep or hold target: the slot just plans the sets.
  const noTarget = !hold && !usesReps(ex.tracking);
  const compound = ex.mechanic === "compound";
  return {
    slotId,
    exId: ex.exId,
    sets: 3,
    repMin: hold || noTarget ? null : compound ? 6 : 10,
    repMax: hold || noTarget ? null : compound ? 10 : 15,
    durationSec: hold ? 30 : null,
    restSec: compound ? 150 : 90,
    warmup: false,
    notes: "",
    alternates: [],
  };
}
