import { MUSCLES, PRIMARY_SET_WEIGHT, SECONDARY_SET_WEIGHT, type Muscle } from "../shared/domain";

export type MuscleLevels = Partial<Record<Muscle, number>>;
export type BodyMapMode = "involvement" | "volume";

/** Involvement level: 2 = primary, 1 = secondary, 0 = not involved. */
export const INVOLVEMENT_PRIMARY = 2;
export const INVOLVEMENT_SECONDARY = 1;

/**
 * Volume scale (estimated weekly sets) to a 0–4 step:
 *   0        -> step 0 (none)
 *   >0 – <3  -> step 1
 *   3  – <6  -> step 2
 *   6  – <10 -> step 3
 *   10+      -> step 4
 */
export const VOLUME_THRESHOLDS = [3, 6, 10] as const;
export const VOLUME_STEP_LABELS = ["0", "<3", "3–6", "6–10", "10+"] as const;

export function volumeStep(sets: number | undefined): 0 | 1 | 2 | 3 | 4 {
  if (sets === undefined || !Number.isFinite(sets) || sets <= 0) return 0;
  if (sets < VOLUME_THRESHOLDS[0]) return 1;
  if (sets < VOLUME_THRESHOLDS[1]) return 2;
  if (sets < VOLUME_THRESHOLDS[2]) return 3;
  return 4;
}

/** Primary wins over secondary; returns only involved muscles. */
export function involvementLevels(exercises: { primary: Muscle[]; secondary: Muscle[] }[]): MuscleLevels {
  const out: MuscleLevels = {};
  for (const ex of exercises) {
    for (const m of ex.secondary) out[m] = Math.max(out[m] ?? 0, INVOLVEMENT_SECONDARY);
    for (const m of ex.primary) out[m] = INVOLVEMENT_PRIMARY;
  }
  return out;
}

/**
 * Estimated sets per muscle: sets × PRIMARY_SET_WEIGHT for primary muscles,
 * sets × SECONDARY_SET_WEIGHT for secondary ones. A muscle listed as both in the
 * same item counts once, as primary. Non-positive or non-finite set counts are ignored.
 */
export function volumeLevels(items: { primary: Muscle[]; secondary: Muscle[]; sets: number }[]): MuscleLevels {
  const out: MuscleLevels = {};
  for (const it of items) {
    if (!Number.isFinite(it.sets) || it.sets <= 0) continue;
    const primary = new Set(it.primary);
    const secondary = new Set(it.secondary.filter((m) => !primary.has(m)));
    for (const m of primary) out[m] = (out[m] ?? 0) + it.sets * PRIMARY_SET_WEIGHT;
    for (const m of secondary) out[m] = (out[m] ?? 0) + it.sets * SECONDARY_SET_WEIGHT;
  }
  return out;
}

/** Normalised display step: involvement 0–2, volume 0–4. */
export function displayStep(mode: BodyMapMode, value: number | undefined): number {
  if (mode === "volume") return volumeStep(value);
  const v = value ?? 0;
  return v >= INVOLVEMENT_PRIMARY ? 2 : v >= INVOLVEMENT_SECONDARY ? 1 : 0;
}

/** Involved muscles, strongest first (ties by label order of MUSCLES). */
export function sortedInvolved(levels: MuscleLevels): Muscle[] {
  return MUSCLES.filter((m) => (levels[m] ?? 0) > 0).sort((a, b) => (levels[b] ?? 0) - (levels[a] ?? 0));
}
