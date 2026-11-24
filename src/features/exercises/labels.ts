// Display labels for exercise attributes. Sentence case, no tracked uppercase (DESIGN.md).
import {
  EQUIPMENT_LABEL,
  MUSCLE_INFO,
  MUSCLES,
  type Equipment,
  type Muscle,
  type MuscleGroup,
  type Pattern,
  type Tracking,
} from "../../shared/domain";

export const PATTERN_LABEL: Record<Pattern, string> = {
  squat: "Squat",
  hinge: "Hinge",
  lunge: "Lunge",
  horizontal_push: "Horizontal push",
  vertical_push: "Vertical push",
  horizontal_pull: "Horizontal pull",
  vertical_pull: "Vertical pull",
  carry: "Carry",
  core_anti_extension: "Core: anti-extension",
  core_rotation: "Core: rotation",
  core_flexion: "Core: flexion",
  isolation_upper: "Upper isolation",
  isolation_lower: "Lower isolation",
  cardio: "Cardio",
  mobility: "Mobility",
};

export const TRACKING_LABEL: Record<Tracking, string> = {
  weight_reps: "Weight × reps",
  bodyweight_reps: "Bodyweight reps",
  assisted_reps: "Assisted reps",
  duration: "Time",
  distance_time: "Distance + time",
};

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  back: "Back",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
  other: "Other",
};

export const musclesInGroups = (groups: readonly MuscleGroup[]): Muscle[] => MUSCLES.filter((m) => groups.includes(MUSCLE_INFO[m].group));

export const muscleList = (ms: readonly Muscle[]) => ms.map((m) => MUSCLE_INFO[m].label).join(", ");

/** Equipment summary without the implied "Bodyweight" when real kit is listed. */
export function equipmentList(eq: readonly Equipment[]): string {
  const real = eq.filter((e) => e !== "bodyweight");
  if (real.length === 0) return eq.length ? "Bodyweight" : "No equipment";
  return real.map((e) => EQUIPMENT_LABEL[e]).join(", ");
}
