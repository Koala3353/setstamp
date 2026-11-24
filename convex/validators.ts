// Strict Convex validators mirroring src/shared/domain.ts and src/shared/sync.ts.
// Used by the schema (so the database itself enforces the shapes) and by
// sync.push to validate each op's `data` individually (see `checkValue`).

import { v, type GenericValidator, type Infer, type VLiteral, type VUnion } from "convex/values";
import { EQUIPMENT, MUSCLES, PATTERNS, TRACKING } from "../src/shared/domain";
import { SYNC_TABLES, type SyncDataMap, type SyncTable } from "../src/shared/sync";

/** `v.union` of string literals, typed as the literal union. */
function literals<const T extends readonly [string, ...string[]]>(values: T) {
  return v.union(...values.map((x) => v.literal(x))) as unknown as VUnion<
    T[number],
    VLiteral<T[number], "required">[],
    "required",
    never
  >;
}

const nullable = <V extends GenericValidator>(x: V) => v.union(x, v.null());

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

export const vMuscle = literals(MUSCLES);
export const vEquipment = literals(EQUIPMENT);
export const vPattern = literals(PATTERNS);
export const vTracking = literals(TRACKING);
export const vUnit = v.union(v.literal("kg"), v.literal("lb"));
export const vSyncTable = literals(SYNC_TABLES);

// ---------------------------------------------------------------------------
// Shared catalog (CatalogExercise)
// ---------------------------------------------------------------------------

export const vSourceRef = v.object({
  source: v.union(v.literal("free-exercise-db"), v.literal("repdb"), v.literal("curated")),
  sourceId: v.string(),
  version: v.string(),
});

export const vExerciseImage = v.object({
  url: v.string(),
  source: v.union(v.literal("repdb"), v.literal("free-exercise-db")),
  attribution: v.string(),
});

export const catalogExerciseFields = {
  exId: v.string(),
  name: v.string(),
  aliases: v.array(v.string()),
  equipment: v.array(vEquipment),
  primary: v.array(vMuscle),
  secondary: v.array(vMuscle),
  pattern: vPattern,
  mechanic: nullable(v.union(v.literal("compound"), v.literal("isolation"))),
  tracking: vTracking,
  unilateral: v.boolean(),
  level: nullable(v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("expert"))),
  commonness: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5)),
  family: nullable(v.string()),
  instructions: v.array(v.string()),
  images: v.array(vExerciseImage),
  sources: v.array(vSourceRef),
  status: v.union(v.literal("active"), v.literal("merged")),
  mergedInto: nullable(v.string()),
};
export const vCatalogExercise = v.object(catalogExerciseFields);

// ---------------------------------------------------------------------------
// Private per-user rows (SyncDataMap)
// ---------------------------------------------------------------------------

export const vSettingsData = v.object({
  unit: vUnit,
  bodyweightKg: nullable(v.number()),
  availableEquipment: v.array(vEquipment),
  defaultRestSec: v.number(),
  barKg: v.number(),
  platesKg: v.array(v.number()),
  showCommunityImages: v.boolean(),
  activeProgramCid: nullable(v.string()),
  goal: nullable(v.union(v.literal("strength"), v.literal("hypertrophy"), v.literal("general"))),
  sessionMinutes: nullable(v.number()),
});

export const vFavoriteData = v.object({ exId: v.string() });

export const vCustomExerciseData = v.object({
  exId: v.string(),
  name: v.string(),
  aliases: v.array(v.string()),
  equipment: v.array(vEquipment),
  primary: v.array(vMuscle),
  secondary: v.array(vMuscle),
  pattern: vPattern,
  tracking: vTracking,
  unilateral: v.boolean(),
  notes: v.string(),
});

export const vPlannedSlot = v.object({
  slotId: v.string(),
  exId: v.string(),
  sets: v.number(),
  repMin: nullable(v.number()),
  repMax: nullable(v.number()),
  durationSec: nullable(v.number()),
  restSec: nullable(v.number()),
  warmup: v.boolean(),
  notes: v.string(),
  alternates: v.array(v.string()),
  // Optional so rows written before supersets existed still validate.
  groupId: v.optional(nullable(v.string())),
});

export const vProgramDay = v.object({ dayId: v.string(), name: v.string(), slots: v.array(vPlannedSlot) });

export const vProgramData = v.object({
  name: v.string(),
  template: v.union(v.literal("upper_lower"), v.literal("ppl"), v.literal("full_body"), v.literal("custom")),
  days: v.array(vProgramDay),
  nextDayIndex: v.number(),
  preferredWeekdays: v.array(v.number()),
  archived: v.boolean(),
  scheduleLog: v.array(
    v.object({
      at: v.number(),
      dayId: v.string(),
      action: v.union(v.literal("completed"), v.literal("skipped"), v.literal("moved")),
      sessionCid: nullable(v.string()),
    }),
  ),
});

export const vSessionData = v.object({
  startedAt: v.number(),
  endedAt: nullable(v.number()),
  name: v.string(),
  programCid: nullable(v.string()),
  dayId: nullable(v.string()),
  notes: v.string(),
  bodyweightKg: nullable(v.number()),
});

export const vSessionExerciseData = v.object({
  sessionCid: v.string(),
  exId: v.string(),
  order: v.number(),
  slotId: nullable(v.string()),
  substitutedFromExId: nullable(v.string()),
  notes: v.string(),
  restSec: nullable(v.number()),
  // Optional so rows written before supersets existed still validate.
  groupId: v.optional(nullable(v.string())),
});

export const vSetData = v.object({
  sessionCid: v.string(),
  sessionExerciseCid: v.string(),
  exId: v.string(),
  order: v.number(),
  kind: v.union(v.literal("warmup"), v.literal("working"), v.literal("drop"), v.literal("failure")),
  weightKg: nullable(v.number()),
  entered: nullable(v.object({ value: v.number(), unit: vUnit })),
  reps: nullable(v.number()),
  assistKg: nullable(v.number()),
  durationSec: nullable(v.number()),
  distanceM: nullable(v.number()),
  rpe: nullable(v.number()),
  done: v.boolean(),
  completedAt: nullable(v.number()),
});

export const dataValidators = {
  settings: vSettingsData,
  favorites: vFavoriteData,
  customExercises: vCustomExerciseData,
  programs: vProgramData,
  sessions: vSessionData,
  sessionExercises: vSessionExerciseData,
  sets: vSetData,
} as const;

// Compile-time check: every validator infers exactly the shared TS type.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssertAll = { [K in SyncTable]: Same<Infer<(typeof dataValidators)[K]>, SyncDataMap[K]> };
const _assertAll: AssertAll = {
  settings: true,
  favorites: true,
  customExercises: true,
  programs: true,
  sessions: true,
  sessionExercises: true,
  sets: true,
};
void _assertAll;

/** Any table's data (or null for a tombstone): the stored `userRows.data`. */
export const vRowData = v.union(
  v.null(),
  vSettingsData,
  vFavoriteData,
  vCustomExerciseData,
  vProgramData,
  vSessionData,
  vSessionExerciseData,
  vSetData,
);

// ---------------------------------------------------------------------------
// Runtime checking of a value against a validator (per-op validation in push)
// ---------------------------------------------------------------------------

export const MAX_STRING = 10_000;
export const MAX_ARRAY = 2_000;

/**
 * Check `value` against a Convex validator without throwing. Returns null when
 * it conforms, else a short reason. Stricter than Convex itself: numbers must
 * be finite, strings and arrays are length-capped, unknown object fields fail.
 */
export function checkValue(validator: GenericValidator, value: unknown, path = "data"): string | null {
  // Validators are plain objects with a `kind` discriminator at runtime.
  const x = validator as unknown as {
    kind: string;
    isOptional: "optional" | "required";
    fields?: Record<string, GenericValidator>;
    element?: GenericValidator;
    members?: GenericValidator[];
    value?: unknown;
  };
  switch (x.kind) {
    case "null":
      return value === null ? null : `${path}: expected null`;
    case "boolean":
      return typeof value === "boolean" ? null : `${path}: expected boolean`;
    case "float64":
      return typeof value === "number" && Number.isFinite(value) ? null : `${path}: expected finite number`;
    case "string":
      if (typeof value !== "string") return `${path}: expected string`;
      return value.length <= MAX_STRING ? null : `${path}: string too long`;
    case "literal":
      return value === x.value ? null : `${path}: expected ${JSON.stringify(x.value)}`;
    case "any":
      return null;
    case "array": {
      if (!Array.isArray(value)) return `${path}: expected array`;
      if (value.length > MAX_ARRAY) return `${path}: array too long`;
      for (let i = 0; i < value.length; i++) {
        const err = checkValue(x.element!, value[i], `${path}[${i}]`);
        if (err) return err;
      }
      return null;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return `${path}: expected object`;
      const obj = value as Record<string, unknown>;
      const fields = x.fields!;
      for (const key of Object.keys(obj)) {
        if (!(key in fields)) return `${path}.${key}: unexpected field`;
      }
      for (const [key, fv] of Object.entries(fields)) {
        const present = key in obj && obj[key] !== undefined;
        if (!present) {
          if ((fv as unknown as { isOptional: string }).isOptional === "optional") continue;
          return `${path}.${key}: missing`;
        }
        const err = checkValue(fv, obj[key], `${path}.${key}`);
        if (err) return err;
      }
      return null;
    }
    case "union": {
      let first: string | null = null;
      for (const m of x.members!) {
        const err = checkValue(m, value, path);
        if (err === null) return null;
        first ??= err;
      }
      return first ?? `${path}: no union member matched`;
    }
    default:
      return `${path}: unsupported validator kind ${x.kind}`;
  }
}
