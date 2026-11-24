// Shared domain contract used by the catalog pipeline, Convex backend and UI.
// Keep this file dependency-free so scripts, convex/ and src/ can all import it.

export const MUSCLES = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "rotator_cuff",
  "lats",
  "upper_back",
  "traps",
  "lower_back",
  "biceps",
  "brachialis",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "serratus",
  "hip_flexors",
  "glutes",
  "abductors",
  "adductors",
  "quads",
  "hamstrings",
  "calves",
  "tibialis",
  "neck",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_GROUPS = ["chest", "shoulders", "back", "arms", "core", "legs", "other"] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_INFO: Record<Muscle, { label: string; group: MuscleGroup; view: "front" | "back" | "both" }> = {
  chest: { label: "Chest", group: "chest", view: "front" },
  front_delts: { label: "Front delts", group: "shoulders", view: "front" },
  side_delts: { label: "Side delts", group: "shoulders", view: "both" },
  rear_delts: { label: "Rear delts", group: "shoulders", view: "back" },
  rotator_cuff: { label: "Rotator cuff", group: "shoulders", view: "back" },
  lats: { label: "Lats", group: "back", view: "back" },
  upper_back: { label: "Upper back", group: "back", view: "back" },
  traps: { label: "Traps", group: "back", view: "both" },
  lower_back: { label: "Lower back", group: "back", view: "back" },
  biceps: { label: "Biceps", group: "arms", view: "front" },
  brachialis: { label: "Brachialis", group: "arms", view: "front" },
  triceps: { label: "Triceps", group: "arms", view: "back" },
  forearms: { label: "Forearms", group: "arms", view: "both" },
  abs: { label: "Abs", group: "core", view: "front" },
  obliques: { label: "Obliques", group: "core", view: "front" },
  serratus: { label: "Serratus", group: "core", view: "front" },
  hip_flexors: { label: "Hip flexors", group: "core", view: "front" },
  glutes: { label: "Glutes", group: "legs", view: "back" },
  abductors: { label: "Abductors", group: "legs", view: "both" },
  adductors: { label: "Adductors", group: "legs", view: "front" },
  quads: { label: "Quads", group: "legs", view: "front" },
  hamstrings: { label: "Hamstrings", group: "legs", view: "back" },
  calves: { label: "Calves", group: "legs", view: "back" },
  tibialis: { label: "Tibialis", group: "legs", view: "front" },
  neck: { label: "Neck", group: "other", view: "both" },
};

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith",
  "bodyweight",
  "band",
  "ez_bar",
  "trap_bar",
  "bench",
  "pull_up_bar",
  "dip_station",
  "medicine_ball",
  "stability_ball",
  "foam_roller",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  cable: "Cable",
  machine: "Machine",
  smith: "Smith machine",
  bodyweight: "Bodyweight",
  band: "Band",
  ez_bar: "EZ bar",
  trap_bar: "Trap bar",
  bench: "Bench",
  pull_up_bar: "Pull-up bar",
  dip_station: "Dip station",
  medicine_ball: "Medicine ball",
  stability_ball: "Stability ball",
  foam_roller: "Foam roller",
  other: "Other",
};

export const PATTERNS = [
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "carry",
  "core_anti_extension",
  "core_rotation",
  "core_flexion",
  "isolation_upper",
  "isolation_lower",
  "cardio",
  "mobility",
] as const;
export type Pattern = (typeof PATTERNS)[number];

/** How a set is recorded. assisted_reps stores assistance as positive kg in `assistKg`. */
export const TRACKING = ["weight_reps", "bodyweight_reps", "assisted_reps", "duration", "distance_time"] as const;
export type Tracking = (typeof TRACKING)[number];

export type SourceRef = {
  source: "free-exercise-db" | "repdb" | "curated";
  sourceId: string;
  version: string; // commit sha or dataset version
};

export type ExerciseImage = {
  url: string;
  source: "repdb" | "free-exercise-db";
  attribution: string;
};

/** Shared catalog row. `exId` is the stable internal ID: never reused or renamed. */
export type CatalogExercise = {
  exId: string;
  name: string;
  aliases: string[];
  equipment: Equipment[];
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern;
  mechanic: "compound" | "isolation" | null;
  tracking: Tracking;
  unilateral: boolean;
  level: "beginner" | "intermediate" | "expert" | null;
  /** Curated 1 (obscure) to 5 (staple). Editorial judgement, NOT measured usage. */
  commonness: 1 | 2 | 3 | 4 | 5;
  /** Variant family, e.g. "squat", "bench_press": groups variants without merging them. */
  family: string | null;
  instructions: string[];
  images: ExerciseImage[];
  sources: SourceRef[];
  status: "active" | "merged";
  mergedInto: string | null;
};

export type Unit = "kg" | "lb";
export const LB_PER_KG = 2.2046226218;
export const toKg = (value: number, unit: Unit) => (unit === "kg" ? value : value / LB_PER_KG);
export const fromKg = (kg: number, unit: Unit) => (unit === "kg" ? kg : kg * LB_PER_KG);

/** Weekly muscle-set estimate weights (documented in the UI as an estimate). */
export const PRIMARY_SET_WEIGHT = 1;
export const SECONDARY_SET_WEIGHT = 0.5;
