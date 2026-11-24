// What each tracking type records. One table so the set editor, the card, "Last time", PRs and
// the log check all agree on which numbers a set needs.
import type { Tracking } from "../shared/domain";
import type { SetData } from "../shared/sync";

export type TrackingFields = {
  /** weight = load in weightKg; added = optional load on top of bodyweight; assist = assistKg. */
  load: "weight" | "added" | "assist" | null;
  reps: boolean;
  time: boolean;
  distance: boolean;
};

export const TRACKING_FIELDS: Record<Tracking, TrackingFields> = {
  weight_reps: { load: "weight", reps: true, time: false, distance: false },
  bodyweight_reps: { load: "added", reps: true, time: false, distance: false },
  assisted_reps: { load: "assist", reps: true, time: false, distance: false },
  duration: { load: null, reps: false, time: true, distance: false },
  weight_duration: { load: "weight", reps: false, time: true, distance: false },
  distance_time: { load: null, reps: false, time: true, distance: true },
  weight_distance: { load: "weight", reps: false, time: false, distance: true },
};

/** Logged as time rather than reps (holds, timed cardio). */
export const isTimed = (t: Tracking) => TRACKING_FIELDS[t].time && !TRACKING_FIELDS[t].reps;
/** A hold: the slot target is a time, not a rep range. */
export const isHold = (t: Tracking) => t === "duration" || t === "weight_duration";
/** The set carries a real external load in weightKg (plate math, warm-ups). */
export const isLoaded = (t: Tracking) => TRACKING_FIELDS[t].load === "weight";
/** Rep-based: e1RM, volume and double progression only apply here. */
export const usesReps = (t: Tracking) => TRACKING_FIELDS[t].reps;

type Loggable = Pick<SetData, "weightKg" | "reps" | "assistKg" | "durationSec" | "distanceM">;

/**
 * The numbers a set needs before it can be logged, so history never holds "– × –".
 * Assistance and added weight stay optional (0 assistance / bodyweight only are real sets);
 * distance is optional for timed cardio, time is optional for carries.
 */
export function canLog(s: Loggable, t: Tracking): boolean {
  switch (t) {
    case "weight_reps":
      return s.weightKg !== null && s.reps !== null;
    case "bodyweight_reps":
    case "assisted_reps":
      return s.reps !== null;
    case "duration":
    case "distance_time":
      return s.durationSec !== null;
    case "weight_duration":
      return s.weightKg !== null && s.durationSec !== null;
    case "weight_distance":
      return s.weightKg !== null && s.distanceM !== null;
  }
}
