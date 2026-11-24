import type { PlannedSlot } from "../../shared/sync";
import type { ExerciseInfo, ExerciseLookup } from "../coverage/coverage";

export { estimateDayMinutes } from "../coverage/coverage";

export type ExerciseIndexLike = { list: readonly ExerciseInfo[]; lookup: ExerciseLookup };

export function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** "8–12", "10", "45s", or null when the slot has no rep or time target (carries). */
export function slotTarget(s: Pick<PlannedSlot, "durationSec" | "repMin" | "repMax">): string | null {
  if (s.durationSec != null) return `${s.durationSec}s`;
  if (s.repMin != null && s.repMax != null && s.repMin !== s.repMax) return `${s.repMin}–${s.repMax}`;
  const r = s.repMin ?? s.repMax;
  return r == null ? null : String(r);
}

/** "3 × 8–12 · rest 2:30 · warm-up" */
export function describeSlot(s: PlannedSlot, defaultRestSec: number): string {
  const target = slotTarget(s);
  const parts = [target ? `${s.sets} × ${target}` : `${s.sets} ${s.sets === 1 ? "set" : "sets"}`, `rest ${formatRest(s.restSec ?? defaultRestSec)}`];
  // Non-breaking hyphen and spaces: a narrow row should wrap between parts, never inside "warm-up".
  if (s.warmup) parts.push("warm\u2011up");
  if (s.alternates.length) parts.push(`${s.alternates.length}\u00a0${s.alternates.length === 1 ? "alternate" : "alternates"}`);
  return parts.join(" · ").replace(/ (×|–) /g, "\u00a0$1\u00a0").replace(/rest /g, "rest\u00a0");
}
