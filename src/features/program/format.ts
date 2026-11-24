import type { PlannedSlot } from "../../shared/sync";
import type { ExerciseInfo, ExerciseLookup } from "../coverage/coverage";

export { estimateDayMinutes } from "../coverage/coverage";

export type ExerciseIndexLike = { list: readonly ExerciseInfo[]; lookup: ExerciseLookup };

export function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** "3 × 8–12 · rest 2:30 · warm-up" */
export function describeSlot(s: PlannedSlot, defaultRestSec: number): string {
  const target =
    s.durationSec != null
      ? `${s.durationSec}s`
      : s.repMin != null && s.repMax != null && s.repMin !== s.repMax
        ? `${s.repMin}–${s.repMax}`
        : String(s.repMin ?? s.repMax ?? "?");
  const parts = [`${s.sets} × ${target}`, `rest ${formatRest(s.restSec ?? defaultRestSec)}`];
  // Non-breaking hyphen and spaces: a narrow row should wrap between parts, never inside "warm-up".
  if (s.warmup) parts.push("warm\u2011up");
  if (s.alternates.length) parts.push(`${s.alternates.length}\u00a0${s.alternates.length === 1 ? "alternate" : "alternates"}`);
  return parts.join(" · ").replace(/ (×|–) /g, "\u00a0$1\u00a0").replace(/rest /g, "rest\u00a0");
}
