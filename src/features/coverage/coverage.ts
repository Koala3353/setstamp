// Muscle coverage for planned program days, the planned week and completed training.
// Pure functions only: the UI passes in an exercise lookup (catalog + custom exercises).
//
// Counting rule (same as docs/PLAN.md "Weekly muscle sets (estimate)"):
//   each working set counts PRIMARY_SET_WEIGHT (1) for every primary muscle of the exercise and
//   SECONDARY_SET_WEIGHT (0.5) for every secondary muscle. It is an estimate of exposure, not of
//   stimulus, fatigue or recovery.

import {
  MUSCLE_INFO,
  PRIMARY_SET_WEIGHT,
  SECONDARY_SET_WEIGHT,
  type Equipment,
  type Muscle,
  type Pattern,
  type Tracking,
} from "../../shared/domain";
import type { PlannedSlot, ProgramData, ProgramDay, SetData } from "../../shared/sync";
import { involvementLevels, volumeLevels, type MuscleLevels } from "../../bodymap";

/** The exercise fields coverage needs. CatalogExercise and custom exercises both fit. */
export type ExerciseInfo = {
  exId: string;
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern;
  equipment: Equipment[];
  tracking: Tracking;
  commonness?: number;
  mechanic?: "compound" | "isolation" | null;
  family?: string | null;
  status?: "active" | "merged";
};

export type ExerciseLookup = (exId: string) => ExerciseInfo | undefined;

export const WEIGHTS = { primary: PRIMARY_SET_WEIGHT, secondary: SECONDARY_SET_WEIGHT } as const;

/** Plain-language explanation shown next to every volume estimate. */
export const ESTIMATE_NOTE = "Estimate: primary = 1 set, secondary = ½ set. Not a measure of stimulus or recovery.";

/**
 * True when the exercise needs only equipment the user has. An empty `available` list means
 * "full gym" (no restriction); bodyweight is always available.
 */
export function canUseEquipment(equipment: readonly Equipment[], available: readonly Equipment[]): boolean {
  if (available.length === 0) return true;
  return equipment.every((e) => e === "bodyweight" || available.includes(e));
}

function slotItems(slots: readonly PlannedSlot[], lookup: ExerciseLookup) {
  const out: { primary: Muscle[]; secondary: Muscle[]; sets: number }[] = [];
  for (const s of slots) {
    const ex = lookup(s.exId);
    if (ex) out.push({ primary: ex.primary, secondary: ex.secondary, sets: s.sets });
  }
  return out;
}

/** Involvement for one day: 2 = some exercise trains it as primary, 1 = only as secondary. */
export function dayCoverage(day: Pick<ProgramDay, "slots">, lookup: ExerciseLookup): MuscleLevels {
  return involvementLevels(slotItems(day.slots, lookup));
}

/** Estimated planned sets per muscle for one day. */
export function dayVolume(day: Pick<ProgramDay, "slots">, lookup: ExerciseLookup): MuscleLevels {
  return volumeLevels(slotItems(day.slots, lookup));
}

/**
 * Estimated planned weekly sets per muscle.
 *
 * Assumption: one rotation of the program = one week, i.e. every day in the program is trained
 * once a week (Upper/Lower 4-day = 4 sessions, PPL 6-day = 6 sessions). The schedule is a rolling
 * queue, so if you train less often than that, real weekly numbers will be lower.
 */
export function weekCoverage(program: Pick<ProgramData, "days">, lookup: ExerciseLookup): MuscleLevels {
  return volumeLevels(program.days.flatMap((d) => slotItems(d.slots, lookup)));
}

export const WEEK_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Sets that count as completed working sets: done, not warm-ups. */
export function isCompletedWorkingSet(s: Pick<SetData, "kind" | "done">): boolean {
  return s.done && s.kind !== "warmup";
}

/**
 * Estimated sets per muscle from what was actually logged in the window [now - windowMs, now].
 * Only done, non-warm-up sets count; each set uses the same primary/secondary weights.
 */
export function completedCoverage(
  sets: readonly Pick<SetData, "exId" | "kind" | "done" | "completedAt">[],
  lookup: ExerciseLookup,
  now: number,
  windowMs = WEEK_DAYS_MS,
): MuscleLevels {
  const perEx = new Map<string, number>();
  for (const s of sets) {
    if (!isCompletedWorkingSet(s) || s.completedAt == null) continue;
    if (s.completedAt < now - windowMs || s.completedAt > now) continue;
    perEx.set(s.exId, (perEx.get(s.exId) ?? 0) + 1);
  }
  const items: { primary: Muscle[]; secondary: Muscle[]; sets: number }[] = [];
  for (const [exId, n] of perEx) {
    const ex = lookup(exId);
    if (ex) items.push({ primary: ex.primary, secondary: ex.secondary, sets: n });
  }
  return volumeLevels(items);
}

export type MuscleUse = { slot: PlannedSlot; exercise: ExerciseInfo; role: "primary" | "secondary"; dayName?: string };

/** Planned exercises that train `muscle`, primary first. */
export function exercisesForMuscle(
  muscle: Muscle,
  days: readonly Pick<ProgramDay, "slots" | "name">[],
  lookup: ExerciseLookup,
): MuscleUse[] {
  const out: MuscleUse[] = [];
  for (const d of days) {
    for (const slot of d.slots) {
      const ex = lookup(slot.exId);
      if (!ex) continue;
      if (ex.primary.includes(muscle)) out.push({ slot, exercise: ex, role: "primary", dayName: d.name });
      else if (ex.secondary.includes(muscle)) out.push({ slot, exercise: ex, role: "secondary", dayName: d.name });
    }
  }
  return out.sort((a, b) => (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1));
}

export type Suggestion = { exercise: ExerciseInfo; reasons: string[]; score: number };

/**
 * Exercises that train `muscle` as primary and fit the user's equipment, ranked by curated
 * commonness plus pattern diversity against what the day already has. Exercises already in the
 * day are left out; ones from the same variant family as an existing exercise rank lower.
 */
export function suggestForMuscle(
  muscle: Muscle,
  catalog: readonly ExerciseInfo[],
  opts: { available: readonly Equipment[]; daySlots: readonly PlannedSlot[]; lookup: ExerciseLookup; limit?: number },
): Suggestion[] {
  const inDay = new Set(opts.daySlots.map((s) => s.exId));
  const dayEx = opts.daySlots.map((s) => opts.lookup(s.exId)).filter((e): e is ExerciseInfo => !!e);
  const patterns = new Set(dayEx.map((e) => e.pattern));
  const families = new Set(dayEx.map((e) => e.family).filter((f): f is string => !!f));
  const out: Suggestion[] = [];
  for (const ex of catalog) {
    if (ex.status && ex.status !== "active") continue;
    if (!ex.primary.includes(muscle) || inDay.has(ex.exId)) continue;
    if (!canUseEquipment(ex.equipment, opts.available)) continue;
    const reasons: string[] = [`${MUSCLE_INFO[muscle].label} is a primary muscle`];
    let score = (ex.commonness ?? 2) * 10;
    if (!patterns.has(ex.pattern)) {
      score += 6;
      reasons.push("adds a movement pattern this day doesn't have");
    }
    if (ex.family && families.has(ex.family)) {
      score -= 8;
      reasons.push("variant of an exercise already in this day");
    }
    if (opts.available.length > 0) reasons.push("uses equipment you have");
    out.push({ exercise: ex, reasons, score });
  }
  out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
  return out.slice(0, opts.limit ?? 6);
}

// ───────────────────────────── time ─────────────────────────────

/** Rough seconds of work per set when the slot is rep-based. */
export const SECONDS_PER_SET = 40;

/**
 * Estimated minutes for a day: Σ sets × (rest + ~40 s of work). Duration slots use their hold
 * time instead of 40 s. Warm-ups and setup time are not included.
 */
export function estimateDayMinutes(day: Pick<ProgramDay, "slots">, defaultRestSec: number): number {
  let sec = 0;
  for (const s of day.slots) {
    const work = s.durationSec ?? SECONDS_PER_SET;
    sec += s.sets * ((s.restSec ?? defaultRestSec) + work);
  }
  return Math.round(sec / 60);
}

// ───────────────────────────── balance notes ─────────────────────────────

export type BalanceNote = { id: string; kind: "gap" | "ratio" | "time" | "info"; text: string };

/** Muscles we comment on when they get no direct work. Smaller muscles stay quiet on purpose. */
export const MAJOR_MUSCLES: readonly Muscle[] = [
  "chest",
  "lats",
  "upper_back",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
];

const PRESS: ReadonlySet<Pattern> = new Set(["horizontal_push", "vertical_push"]);
const PULL: ReadonlySet<Pattern> = new Set(["horizontal_pull", "vertical_pull"]);
const KNEE: ReadonlySet<Pattern> = new Set(["squat", "lunge"]);
const HIP: ReadonlySet<Pattern> = new Set(["hinge"]);

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const listNames = (names: string[]) => {
  const u = [...new Set(names)];
  if (u.length <= 2) return u.join(" and ");
  return `${u.slice(0, -1).join(", ")} and ${u[u.length - 1]}`;
};

/** A ratio is noted when one side is at least this many times the other. */
export const RATIO_NOTE_AT = 1.5;

/**
 * Rule-based, plain-language notes about the planned week. Information, not prescriptions:
 * notes describe what is planned and never say what the user must do.
 */
export function balanceNotes(
  program: Pick<ProgramData, "days">,
  lookup: ExerciseLookup,
  opts: { defaultRestSec: number; sessionMinutes: number | null },
): BalanceNote[] {
  const notes: BalanceNote[] = [];
  const allSlots = program.days.flatMap((d) => d.slots);
  if (allSlots.length === 0) return notes;

  // Gaps: no direct (primary) work.
  for (const m of MAJOR_MUSCLES) {
    const uses = exercisesForMuscle(m, program.days, lookup);
    const label = MUSCLE_INFO[m].label;
    if (uses.some((u) => u.role === "primary")) continue;
    if (uses.length > 0) {
      const names = [...new Set(uses.map((u) => u.exercise.name))];
      notes.push({
        id: `gap-${m}`,
        kind: "gap",
        text: `No direct ${label.toLowerCase()} work planned. ${listNames(names)} ${names.length === 1 ? "works" : "work"} ${label.toLowerCase()} as a secondary muscle.`,
      });
    } else {
      notes.push({ id: `gap-${m}`, kind: "gap", text: `Nothing planned trains ${label.toLowerCase()} this week.` });
    }
  }

  // Pattern balance (sets by movement pattern, not by muscle).
  const sumSets = (ps: ReadonlySet<Pattern>) =>
    allSlots.reduce((acc, s) => {
      const ex = lookup(s.exId);
      return ex && ps.has(ex.pattern) ? acc + s.sets : acc;
    }, 0);
  const ratio = (id: string, aName: string, a: number, bName: string, b: number) => {
    if (a === 0 && b === 0) return;
    if (Math.max(a, b) < RATIO_NOTE_AT * Math.min(a, b) && Math.min(a, b) > 0) return;
    notes.push({ id, kind: "ratio", text: `${aName} ${fmt(a)} sets vs ${bName} ${fmt(b)} planned per week (counted by movement pattern).` });
  };
  ratio("ratio-press-pull", "Pressing", sumSets(PRESS), "pulling", sumSets(PULL));
  ratio("ratio-knee-hip", "Squat and lunge patterns", sumSets(KNEE), "hinge patterns", sumSets(HIP));

  // Time.
  if (opts.sessionMinutes && opts.sessionMinutes > 0) {
    for (const d of program.days) {
      const min = estimateDayMinutes(d, opts.defaultRestSec);
      if (min > opts.sessionMinutes) {
        notes.push({
          id: `time-${d.name}`,
          kind: "time",
          text: `${d.name} is about ${min} min at your rest times, over your ${opts.sessionMinutes} min target. Fewer sets or shorter rests on isolation work would bring it down.`,
        });
      }
    }
  }

  notes.push({
    id: "overlap",
    kind: "info",
    text: "Overlap is normal: most compound lifts train several muscles, so a muscle getting secondary work from one exercise and direct work from another is expected. Not every muscle needs training every session.",
  });
  return notes;
}
