// Display strings for the Stats tab. Values arrive in kg / seconds; the user's unit is applied here.
import type { MuscleGroup, Unit } from "../../shared/domain";
import { fmtInt, fmtNum, kgToDisplay } from "../../logic/units";
import { fmtLoad } from "./format";
import type { PrEvent, StatsRange } from "./stats";

export const RANGE_LABEL: Record<StatsRange, string> = {
  "4w": "4 weeks",
  "12w": "12 weeks",
  "1y": "1 year",
  all: "All time",
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

/** Hours with one decimal, or whole minutes under an hour: { value: "41.5", unit: "h" }. */
export function fmtDuration(sec: number): { value: string; unit: string } {
  if (sec < 3600) return { value: fmtInt(sec / 60), unit: "min" };
  return { value: fmtNum(Math.round(sec / 360) / 10), unit: "h" };
}

/** Compact axis label: 950, 12k, 1.2M. */
export function fmtCompact(n: number): string {
  if (n >= 1e6) return `${fmtNum(Math.round(n / 1e5) / 10)}M`;
  if (n >= 1e4) return `${fmtInt(n / 1e3)}k`;
  if (n >= 1e3) return `${fmtNum(Math.round(n / 100) / 10)}k`;
  return fmtNum(n);
}

/** Sets estimate with at most one decimal: 12, 7.5. */
export const fmtEst = (n: number) => fmtNum(Math.round(n * 10) / 10);

/** One line per record: "110 kg heaviest, was 100 kg". */
export function fmtPrEvent(e: PrEvent, unit: Unit): string {
  switch (e.kind) {
    case "heaviest":
      return `Heaviest ${fmtLoad(e.value, unit)}, was ${fmtLoad(e.previous, unit)}`;
    case "e1rm":
      return `Est. 1RM ${fmtLoad(e.value, unit)}, was ${fmtLoad(e.previous, unit)}`;
    case "reps_at_weight":
      return `${e.value} reps at ${fmtLoad(e.atKg ?? 0, unit)}, was ${e.previous}`;
    case "most_reps":
      return `${e.value} reps in one set, was ${e.previous}`;
    case "longest_hold":
      return `${e.value} s hold, was ${e.previous} s`;
    case "longest_at_load":
      return `${e.value} s at ${fmtLoad(e.atKg ?? 0, unit)}, was ${e.previous} s`;
    case "load_distance":
      return `${fmtInt(kgToDisplay(e.value, unit) ?? 0)} ${unit}·m load × distance, was ${fmtInt(kgToDisplay(e.previous, unit) ?? 0)}`;
  }
}
