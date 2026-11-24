// Rule-based double progression. The hint always carries the rule it applied, in words.
import { toKg, type Unit } from "../shared/domain";
import type { SetData } from "../shared/sync";
import { displayWeight, fmtNum, roundTo } from "./units";

export type ProgressionHint = {
  action: "increase" | "hold" | "add_reps" | "none";
  /** Suggested load in the user's unit (null = keep / not applicable). */
  suggest: { value: number; unit: Unit; weightKg: number } | null;
  /** The rule, always shown. */
  rule: string;
  /** What happened last time, in a short sentence. */
  reason: string;
};

export function ruleText(repMin: number, repMax: number, inc: number, unit: Unit): string {
  return `Double progression: when every working set reaches ${repMax} reps at the same weight, add ${fmtNum(inc)} ${unit}. If any set falls below ${repMin}, hold the weight.`;
}

/**
 * @param last  last session's sets for this exercise (warm-ups are ignored)
 * @param inc   smallest increment in `unit` (see smallestIncrement)
 */
export function progressionHint(
  last: readonly Pick<SetData, "kind" | "done" | "weightKg" | "entered" | "reps">[],
  repMin: number | null,
  repMax: number | null,
  inc: number,
  unit: Unit,
): ProgressionHint {
  const working = last.filter((s) => s.done && s.kind !== "warmup" && s.reps !== null && s.weightKg !== null);
  if (repMin === null || repMax === null || working.length === 0) {
    return { action: "none", suggest: null, rule: repMin !== null && repMax !== null ? ruleText(repMin, repMax, inc, unit) : "", reason: "No working sets to compare yet." };
  }
  const rule = ruleText(repMin, repMax, inc, unit);
  const weights = working.map((s) => displayWeight(s, unit) ?? 0);
  const top = Math.max(...weights);
  const same = weights.every((w) => Math.abs(w - weights[0]!) < 1e-6);
  if (working.some((s) => (s.reps ?? 0) < repMin)) {
    return { action: "hold", suggest: { value: top, unit, weightKg: toKg(top, unit) }, rule, reason: `A set fell below ${repMin} reps last time: hold ${fmtNum(top)} ${unit}.` };
  }
  if (same && working.every((s) => (s.reps ?? 0) >= repMax)) {
    const next = roundTo(top + inc, inc > 0 ? Math.min(inc, 0.5) : 0.5);
    return { action: "increase", suggest: { value: next, unit, weightKg: toKg(next, unit) }, rule, reason: `All sets hit ${repMax} at ${fmtNum(top)} ${unit}: go to ${fmtNum(next)} ${unit}.` };
  }
  return { action: "add_reps", suggest: { value: top, unit, weightKg: toKg(top, unit) }, rule, reason: `In range at ${fmtNum(top)} ${unit}: add reps until every set reaches ${repMax}.` };
}
