// Warm-up ramp: bar×10, 40%×5, 60%×3, 80%×1, rounded down to loadable weights.
import type { Equipment, Tracking, Unit } from "../shared/domain";
import { fromKg, toKg } from "../shared/domain";
import { roundDownToLoadable } from "./plates";
import { floorTo, smallestIncrement } from "./units";

export type WarmupSet = { weightKg: number; reps: number };

export const WARMUP_STEPS: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 1 },
];

export function generateWarmups(
  workKg: number | null,
  opts: { tracking: Tracking; equipment: readonly Equipment[]; barKg: number; platesKg: readonly number[]; unit: Unit },
): WarmupSet[] {
  if (opts.tracking !== "weight_reps" || workKg === null || !(workKg > 0)) return [];
  const barbell = opts.equipment.some((e) => e === "barbell" || e === "ez_bar" || e === "trap_bar" || e === "smith");
  const out: WarmupSet[] = [];
  const push = (kg: number, reps: number) => {
    if (kg >= workKg - 1e-6 || kg <= 0) return;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.weightKg - kg) < 1e-6) return; // collapse duplicates
    out.push({ weightKg: kg, reps });
  };
  if (barbell) {
    if (workKg <= opts.barKg + 1e-6) return [];
    push(opts.barKg, 10);
    for (const s of WARMUP_STEPS) push(roundDownToLoadable(workKg * s.pct, opts.barKg, opts.platesKg), s.reps);
  } else {
    const inc = smallestIncrement(opts.equipment, opts.unit);
    for (const s of WARMUP_STEPS) push(toKg(floorTo(fromKg(workKg * s.pct, opts.unit), inc), opts.unit), s.reps);
  }
  return out;
}
