// Weight units: storage is canonical kg plus the value as typed (`entered`), so a 45 lb plate
// never drifts to 44.9 on the way back out. Display never rewrites history.
import { fromKg, toKg, type Equipment, type Unit } from "../shared/domain";

const EPS = 1e-9;

/** Round `n` to the nearest multiple of `inc` (no float dust: 102.49999 -> 102.5). */
export function roundTo(n: number, inc: number): number {
  if (!(inc > 0)) return n;
  const decimals = Math.max(0, (String(inc).split(".")[1] ?? "").length);
  return Number((Math.round(n / inc + EPS) * inc).toFixed(Math.min(4, decimals + 2)));
}

/** Round down to a multiple of `inc`. */
export function floorTo(n: number, inc: number): number {
  if (!(inc > 0)) return n;
  return roundTo(Math.floor(n / inc + 1e-6) * inc, inc);
}

/** Display precision when converting a value typed in the other unit. */
export const DISPLAY_INCREMENT: Record<Unit, number> = { kg: 0.25, lb: 0.5 };

/**
 * Smallest sensible load jump for an implement, in the user's unit.
 * Barbell 2.5 kg / 5 lb (two smallest common plates), dumbbells 2 kg / 5 lb, machines/cables 2.5 kg / 5 lb.
 */
export function smallestIncrement(equipment: readonly Equipment[], unit: Unit): number {
  const has = (e: Equipment) => equipment.includes(e);
  if (has("dumbbell") || has("kettlebell")) return unit === "kg" ? 2 : 5;
  return unit === "kg" ? 2.5 : 5;
}

export type WeightLike = { weightKg: number | null; entered: { value: number; unit: Unit } | null };

/**
 * A stored weight shown in `unit`. If it was typed in that unit, the typed value comes back
 * exactly; otherwise it is converted and rounded to `inc` (default display precision).
 */
export function displayWeight(w: WeightLike, unit: Unit, inc = DISPLAY_INCREMENT[unit]): number | null {
  if (w.entered && w.entered.unit === unit) return w.entered.value;
  if (w.weightKg === null) return null;
  return roundTo(fromKg(w.weightKg, unit), inc);
}

/** Display of a bare kg value (assistance, suggestions) in `unit`. */
export function kgToDisplay(kg: number | null, unit: Unit, inc = DISPLAY_INCREMENT[unit]): number | null {
  if (kg === null) return null;
  return roundTo(fromKg(kg, unit), inc);
}

/** Build the stored pair from a value typed in `unit`. */
export function fromEntered(value: number | null, unit: Unit): { weightKg: number | null; entered: { value: number; unit: Unit } | null } {
  if (value === null || !Number.isFinite(value)) return { weightKg: null, entered: null };
  return { weightKg: toKg(value, unit), entered: { value, unit } };
}

// One formatter for every number the app shows: grouped thousands, at most two decimals,
// no trailing zeros. Pinned to "en" until the app is localised, so shown numbers match what
// the steppers accept (a "." decimal) and the CSV export.
const NUM = new Intl.NumberFormat("en", { maximumFractionDigits: 2, useGrouping: true });
const INT = new Intl.NumberFormat("en", { maximumFractionDigits: 0, useGrouping: true });

/** "100", "102.5", "3,660" — grouped, trims trailing zeros. */
export function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "–";
  return NUM.format(Number(n.toFixed(2)) || 0);
}

/** Whole-number totals (volume, counts): "3,660". */
export function fmtInt(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "–";
  return INT.format(Math.round(n) || 0);
}
