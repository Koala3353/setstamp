// Metrics defined in docs/PLAN.md: e1RM (Epley, ≤10 reps, labelled estimate), volume load
// (working sets only, assisted excluded) and per-exercise PRs (warm-ups excluded).
import type { Tracking } from "../shared/domain";
import type { SetData } from "../shared/sync";

export type E1rm = { kg: number; estimated: boolean };

/** Epley 1RM. Only sets of 1–10 reps qualify; a single is the real 1RM, not an estimate. */
export function epley(weightKg: number | null, reps: number | null): E1rm | null {
  if (weightKg === null || reps === null || !(weightKg > 0)) return null;
  if (!Number.isInteger(reps) || reps < 1 || reps > 10) return null;
  if (reps === 1) return { kg: weightKg, estimated: false };
  return { kg: weightKg * (1 + reps / 30), estimated: true };
}

type SetLike = Pick<SetData, "kind" | "done" | "weightKg" | "reps" | "assistKg" | "durationSec"> & Partial<Pick<SetData, "sessionCid">>;

export const isWorking = (s: Pick<SetData, "kind">) => s.kind !== "warmup";
const counted = (s: SetLike) => s.done && isWorking(s);

/** Σ weight × reps over done working sets. Assisted sets record assistance, not load. */
export function volumeLoad(sets: readonly SetLike[], tracking?: Tracking): number {
  if (tracking === "assisted_reps" || tracking === "duration" || tracking === "distance_time") return 0;
  let v = 0;
  for (const s of sets) {
    if (!counted(s) || s.assistKg !== null) continue;
    if (s.weightKg !== null && s.reps !== null && s.weightKg > 0) v += s.weightKg * s.reps;
  }
  return v;
}

export type PrKind = "weight_at_reps" | "e1rm" | "most_reps" | "least_assist" | "longest_duration" | "session_volume";

export type PR = {
  kind: PrKind;
  /** Rep count for weight_at_reps / least_assist. */
  reps: number | null;
  /** kg for loads, reps for most_reps, seconds for duration. */
  value: number;
  previous: number;
  estimated: boolean;
};

export type Bests = {
  weightAtReps: Map<number, number>;
  e1rm: number | null;
  mostReps: number | null;
  leastAssistAtReps: Map<number, number>;
  longestDuration: number | null;
  sessionVolume: number | null;
};

/** All-time bests over done working sets (warm-ups excluded). Used by detectPRs and the Progress PR cards. */
export function bests(sets: readonly SetLike[], tracking: Tracking): Bests {
  const b: Bests = { weightAtReps: new Map(), e1rm: null, mostReps: null, leastAssistAtReps: new Map(), longestDuration: null, sessionVolume: null };
  const bySession = new Map<string, SetLike[]>();
  for (const s of sets) {
    if (!counted(s)) continue;
    const key = s.sessionCid ?? "_";
    bySession.set(key, [...(bySession.get(key) ?? []), s]);
    if (tracking === "duration") {
      if (s.durationSec !== null) b.longestDuration = Math.max(b.longestDuration ?? 0, s.durationSec);
      continue;
    }
    if (tracking === "assisted_reps") {
      if (s.reps !== null && s.reps > 0 && s.assistKg !== null) {
        const cur = b.leastAssistAtReps.get(s.reps);
        if (cur === undefined || s.assistKg < cur) b.leastAssistAtReps.set(s.reps, s.assistKg);
      }
      continue;
    }
    if (tracking === "bodyweight_reps" && (s.weightKg === null || s.weightKg <= 0)) {
      if (s.reps !== null) b.mostReps = Math.max(b.mostReps ?? 0, s.reps);
      continue;
    }
    if (s.weightKg !== null && s.reps !== null && s.reps > 0) {
      const cur = b.weightAtReps.get(s.reps);
      if (cur === undefined || s.weightKg > cur) b.weightAtReps.set(s.reps, s.weightKg);
      const e = epley(s.weightKg, s.reps);
      if (e && (b.e1rm === null || e.kg > b.e1rm)) b.e1rm = e.kg;
    }
  }
  if (tracking === "weight_reps" || tracking === "bodyweight_reps") {
    for (const ss of bySession.values()) {
      const v = volumeLoad(ss, tracking);
      if (v > 0) b.sessionVolume = Math.max(b.sessionVolume ?? 0, v);
    }
  }
  return b;
}

const EPS = 1e-6;

/**
 * PRs set by `current` (one session's sets of one exercise) against all `prior` sets of the
 * same exercise. A record needs something to beat: first-ever logs are not PRs.
 */
export function detectPRs(prior: readonly SetLike[], current: readonly SetLike[], tracking: Tracking): PR[] {
  const before = bests(prior, tracking);
  const now = bests(current, tracking);
  const out: PR[] = [];
  for (const [reps, kg] of now.weightAtReps) {
    const prev = before.weightAtReps.get(reps);
    if (prev !== undefined && kg > prev + EPS) out.push({ kind: "weight_at_reps", reps, value: kg, previous: prev, estimated: false });
  }
  if (now.e1rm !== null && before.e1rm !== null && now.e1rm > before.e1rm + EPS) {
    out.push({ kind: "e1rm", reps: null, value: now.e1rm, previous: before.e1rm, estimated: true });
  }
  if (now.mostReps !== null && before.mostReps !== null && now.mostReps > before.mostReps) {
    out.push({ kind: "most_reps", reps: null, value: now.mostReps, previous: before.mostReps, estimated: false });
  }
  for (const [reps, kg] of now.leastAssistAtReps) {
    const prev = before.leastAssistAtReps.get(reps);
    if (prev !== undefined && kg < prev - EPS) out.push({ kind: "least_assist", reps, value: kg, previous: prev, estimated: false });
  }
  if (now.longestDuration !== null && before.longestDuration !== null && now.longestDuration > before.longestDuration) {
    out.push({ kind: "longest_duration", reps: null, value: now.longestDuration, previous: before.longestDuration, estimated: false });
  }
  if (now.sessionVolume !== null && before.sessionVolume !== null && now.sessionVolume > before.sessionVolume + EPS) {
    out.push({ kind: "session_volume", reps: null, value: now.sessionVolume, previous: before.sessionVolume, estimated: false });
  }
  return out;
}
