// Previous-performance lookup and the one-line "Last: 100×8, 100×8, 100×7" summary.
import type { Tracking, Unit } from "../shared/domain";
import type { SessionData, SetData } from "../shared/sync";
import { displayWeight, fmtNum, kgToDisplay } from "./units";

type Row<T> = { cid: string; data: T | null };

export type PreviousPerformance = { sessionCid: string; startedAt: number; sets: SetData[] };

/**
 * The most recent *completed* session (endedAt set) containing done sets of `exId`,
 * excluding `excludeSessionCid` (the one in progress). Sets come back in logged order.
 */
export function previousPerformance(
  exId: string,
  sessions: readonly Row<SessionData>[],
  sets: readonly Row<SetData>[],
  excludeSessionCid?: string | null,
): PreviousPerformance | null {
  const bySession = new Map<string, SetData[]>();
  for (const r of sets) {
    const s = r.data;
    if (!s || s.exId !== exId || !s.done || s.sessionCid === excludeSessionCid) continue;
    const list = bySession.get(s.sessionCid);
    if (list) list.push(s);
    else bySession.set(s.sessionCid, [s]);
  }
  let best: PreviousPerformance | null = null;
  for (const r of sessions) {
    const d = r.data;
    if (!d || d.endedAt === null || r.cid === excludeSessionCid) continue;
    const ss = bySession.get(r.cid);
    if (!ss?.length) continue;
    if (!best || d.startedAt > best.startedAt) best = { sessionCid: r.cid, startedAt: d.startedAt, sets: ss };
  }
  if (best) best.sets = [...best.sets].sort((a, b) => a.order - b.order);
  return best;
}

/** "100×8", "BW×12", "−20×6" (assist), "45s", "20×45s" (load × time), "40×30m" (load × distance), "400m 95s". */
export function formatSetShort(
  s: Pick<SetData, "weightKg" | "entered" | "reps" | "assistKg" | "durationSec"> & Partial<Pick<SetData, "distanceM">>,
  tracking: Tracking,
  unit: Unit,
): string {
  const sec = s.durationSec !== null ? `${s.durationSec}s` : "–";
  const m = s.distanceM != null ? `${fmtNum(s.distanceM)}m` : "–";
  switch (tracking) {
    case "duration":
      return sec;
    case "distance_time":
      return s.distanceM != null ? `${m} ${sec}` : sec;
    case "weight_duration":
      return `${fmtNum(displayWeight(s, unit))}×${sec}`;
    case "weight_distance":
      return `${fmtNum(displayWeight(s, unit))}×${m}`;
  }
  const reps = s.reps ?? "–";
  if (tracking === "assisted_reps") return `${s.assistKg === null ? "–" : `−${fmtNum(kgToDisplay(s.assistKg, unit))}`}×${reps}`;
  const w = displayWeight(s, unit);
  if (tracking === "bodyweight_reps" && (w === null || w === 0)) return `BW×${reps}`;
  return `${tracking === "bodyweight_reps" ? "+" : ""}${fmtNum(w)}×${reps}`;
}

/** "100×8, 100×8, 100×7" over working sets (warm-ups left out). */
export function formatLast(sets: readonly SetData[], tracking: Tracking, unit: Unit): string {
  return sets
    .filter((s) => s.kind !== "warmup")
    .map((s) => formatSetShort(s, tracking, unit))
    .join(", ");
}
