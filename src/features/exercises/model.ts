// Pure exercise-feature logic (no React): catalog + custom merge, measured usage, substitutions.
// Measured usage (what YOU log) and curated commonness (editorial "staple") are kept distinct.
import { MUSCLE_INFO, type CatalogExercise, type Equipment, type Muscle } from "../../shared/domain";
import type { CustomExerciseData, SetData } from "../../shared/sync";
import type { SearchableExercise, SearchFilters } from "../../search";

// ─────────────────────────────── entries ───────────────────────────────

/** One searchable exercise, catalog or the user's custom one. */
export type ExerciseEntry = SearchableExercise & {
  unilateral: boolean;
  /** The full catalog row (null for custom exercises). */
  catalog: CatalogExercise | null;
  /** Row cid of a custom exercise (null for catalog ones). */
  customCid: string | null;
  notes: string;
};

export const CUSTOM_PREFIX = "cx_";
export const customExId = (cid: string) => CUSTOM_PREFIX + cid;

export function catalogEntry(ex: CatalogExercise): ExerciseEntry {
  return {
    exId: ex.exId,
    name: ex.name,
    aliases: ex.aliases,
    equipment: ex.equipment,
    primary: ex.primary,
    secondary: ex.secondary,
    pattern: ex.pattern,
    family: ex.family,
    commonness: ex.commonness,
    tracking: ex.tracking,
    unilateral: ex.unilateral,
    catalog: ex,
    customCid: null,
    notes: "",
  };
}

export function customEntry(cid: string, d: CustomExerciseData): ExerciseEntry {
  return {
    exId: d.exId || customExId(cid),
    name: d.name,
    aliases: d.aliases,
    equipment: d.equipment,
    primary: d.primary,
    secondary: d.secondary,
    pattern: d.pattern,
    family: null,
    tracking: d.tracking,
    custom: true,
    unilateral: d.unilateral,
    catalog: null,
    customCid: cid,
    notes: d.notes,
  };
}

/** Active catalog rows plus custom rows. Merged catalog rows are left out (resolve them instead). */
export function buildEntries(
  catalog: readonly CatalogExercise[],
  custom: ReadonlyArray<{ cid: string; data: CustomExerciseData | null }>,
): ExerciseEntry[] {
  const out: ExerciseEntry[] = [];
  for (const ex of catalog) if (ex.status !== "merged") out.push(catalogEntry(ex));
  for (const r of custom) if (r.data) out.push(customEntry(r.cid, r.data));
  return out;
}

/** Follow `mergedInto` chains so old exIds (from history) still resolve. */
export function resolveExId(exId: string, catalogById: ReadonlyMap<string, CatalogExercise>): string {
  let id = exId;
  for (let i = 0; i < 8; i++) {
    const ex = catalogById.get(id);
    if (!ex || ex.status !== "merged" || !ex.mergedInto) return id;
    id = ex.mergedInto;
  }
  return id;
}

// ─────────────────────────────── measured usage ───────────────────────────────

export type UsageSet = Pick<SetData, "exId" | "sessionCid" | "done" | "completedAt"> & { updatedAt?: number };

export type MeasuredUsage = {
  /** exId → last time a set was completed (ms). */
  recent: Record<string, number>;
  /** exId → number of distinct sessions with at least one completed set. */
  frequency: Record<string, number>;
};

/** Logged in at least this many sessions = "Your usual". */
export const USUAL_MIN_SESSIONS = 3;
/** Curated commonness at or above this = "Staple". */
export const STAPLE_MIN_COMMONNESS = 4;

/** Measured usage from the user's own completed sets. Planned/unfinished sets don't count. */
export function deriveUsage(sets: readonly UsageSet[]): MeasuredUsage {
  const recent: Record<string, number> = {};
  const sessions = new Map<string, Set<string>>();
  for (const s of sets) {
    if (!s.done || !s.exId) continue;
    let seen = sessions.get(s.exId);
    if (!seen) sessions.set(s.exId, (seen = new Set()));
    seen.add(s.sessionCid);
    const t = s.completedAt ?? s.updatedAt ?? null;
    if (t != null && t > (recent[s.exId] ?? -Infinity)) recent[s.exId] = t;
  }
  const frequency: Record<string, number> = {};
  for (const [exId, seen] of sessions) frequency[exId] = seen.size;
  return { recent, frequency };
}

export const isUsual = (usage: MeasuredUsage, exId: string) => (usage.frequency[exId] ?? 0) >= USUAL_MIN_SESSIONS;
export const isStaple = (ex: { commonness?: number; custom?: boolean }) => !ex.custom && (ex.commonness ?? 0) >= STAPLE_MIN_COMMONNESS;

/** exIds ordered by most recent use. */
export function recentExIds(usage: MeasuredUsage, limit = 8): string[] {
  return Object.entries(usage.recent)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// ─────────────────────────────── equipment ───────────────────────────────

/** Equipment the exercise actually needs (bodyweight needs nothing). */
export const needsOf = (ex: { equipment: readonly Equipment[] }) => ex.equipment.filter((e) => e !== "bodyweight");

/** Empty `available` means "full gym": everything is doable. */
export function canDo(ex: { equipment: readonly Equipment[] }, available: readonly Equipment[]): boolean {
  if (available.length === 0) return true;
  return needsOf(ex).every((e) => available.includes(e));
}

/** Same semantics as the search index's filters (equipment/muscles: any-of; muscles: primary or secondary). */
export function passesFilters(ex: SearchableExercise, f: SearchFilters): boolean {
  if (f.patterns?.length && !f.patterns.includes(ex.pattern)) return false;
  if (f.tracking?.length && !f.tracking.includes(ex.tracking)) return false;
  if (f.equipment?.length && !ex.equipment.some((e) => f.equipment!.includes(e))) return false;
  if (f.muscles?.length && ![...ex.primary, ...ex.secondary].some((m) => f.muscles!.includes(m))) return false;
  return true;
}

// ─────────────────────────────── substitution ───────────────────────────────

export type SubstituteOptions = {
  availableEquipment?: readonly Equipment[];
  usage?: MeasuredUsage;
  favorites?: ReadonlySet<string>;
  limit?: number;
};

export type Substitute<T> = {
  exercise: T;
  score: number;
  /** Short, user-facing explanation, e.g. "Same movement · hits quads, glutes". */
  why: string;
  sameFamily: boolean;
  samePattern: boolean;
  sharedPrimary: Muscle[];
  available: boolean;
};

type SubFields = Pick<
  SearchableExercise,
  "exId" | "name" | "equipment" | "primary" | "secondary" | "pattern" | "family" | "commonness" | "tracking" | "custom"
>;

/**
 * Rank swaps for `target`: same family / movement pattern, overlapping primary muscles and
 * equipment the user has. A candidate needs a shared pattern, family or primary muscle to qualify.
 * Measured usage nudges ties; it never outranks a better movement match.
 */
export function rankSubstitutes<T extends SubFields>(
  target: SubFields,
  candidates: readonly T[],
  opts: SubstituteOptions = {},
): Substitute<T>[] {
  const available = opts.availableEquipment ?? [];
  const targetPrimary = new Set(target.primary);
  const targetSecondary = new Set(target.secondary);
  const out: Substitute<T>[] = [];

  for (const c of candidates) {
    if (c.exId === target.exId) continue;
    const sameFamily = !!target.family && c.family === target.family;
    const samePattern = c.pattern === target.pattern;
    const sharedPrimary = c.primary.filter((m) => targetPrimary.has(m));
    if (!sameFamily && !samePattern && sharedPrimary.length === 0) continue;

    let score = 0;
    if (sameFamily) score += 4;
    if (samePattern) score += 3;
    if (targetPrimary.size) score += (4 * sharedPrimary.length) / targetPrimary.size;
    score += 0.5 * c.primary.filter((m) => targetSecondary.has(m)).length;
    score -= 0.4 * c.primary.filter((m) => !targetPrimary.has(m) && !targetSecondary.has(m)).length;
    if (c.tracking === target.tracking) score += 0.5;

    const ok = canDo(c, available);
    if (available.length) score += ok ? 1.5 : -3;

    const f = opts.usage?.frequency[c.exId] ?? 0;
    if (f > 0) score += Math.min(1, Math.log2(1 + f) * 0.4);
    if (opts.favorites?.has(c.exId)) score += 0.5;
    score += ((c.commonness ?? 3) - 3) * 0.2;

    const parts: string[] = [];
    if (sameFamily) parts.push("Same family");
    else if (samePattern) parts.push("Same movement");
    if (sharedPrimary.length) parts.push("hits " + sharedPrimary.map((m) => MUSCLE_INFO[m].label.toLowerCase()).join(", "));
    if (!ok)
      parts.push(
        "needs " +
          needsOf(c)
            .filter((e) => !available.includes(e))
            .join(", ")
            .replace(/_/g, " "),
      );

    out.push({
      exercise: c,
      score,
      why: parts.join(" · "),
      sameFamily,
      samePattern,
      sharedPrimary,
      available: ok,
    });
  }

  out.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
  return opts.limit ? out.slice(0, opts.limit) : out;
}
