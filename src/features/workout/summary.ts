// Finish-screen numbers: duration, sets, volume load and PRs (per exercise, estimates labelled).
import type { Unit } from "../../shared/domain";
import type { SessionData, SessionExerciseData, SetData } from "../../shared/sync";
import { detectPRs, volumeLoad, type PR } from "../../logic/metrics";
import { fmtInt, fmtNum, kgToDisplay } from "../../logic/units";
import type { ExLookup } from "./exerciseInfo";

type Rows<T> = readonly { cid: string; data: T | null }[];

export type Summary = {
  durationSec: number;
  setsDone: number;
  volumeKg: number;
  plannedLeft: number;
  prs: Array<{ exName: string; pr: PR }>;
};

export function summarize(
  sessionCid: string,
  session: SessionData,
  exercises: Rows<SessionExerciseData>,
  sessions: Rows<SessionData>,
  sets: Rows<SetData>,
  lookup: ExLookup,
  now = Date.now(),
): Summary {
  const finished = new Set(sessions.filter((r) => r.data?.endedAt !== null && r.cid !== sessionCid).map((r) => r.cid));
  const mine = sets.filter((r) => r.data?.sessionCid === sessionCid).map((r) => r.data!);
  const done = mine.filter((s) => s.done);
  let volumeKg = 0;
  const prs: Summary["prs"] = [];
  const exIds = new Set(exercises.filter((r) => r.data?.sessionCid === sessionCid).map((r) => r.data!.exId));
  for (const s of done) exIds.add(s.exId);
  for (const exId of exIds) {
    const info = lookup(exId);
    const cur = done.filter((s) => s.exId === exId);
    volumeKg += volumeLoad(cur, info.tracking);
    const prior = sets.filter((r) => r.data && r.data.exId === exId && finished.has(r.data.sessionCid)).map((r) => r.data!);
    for (const pr of detectPRs(prior, cur, info.tracking)) prs.push({ exName: info.name, pr });
  }
  return {
    durationSec: Math.max(0, ((session.endedAt ?? now) - session.startedAt) / 1000),
    setsDone: done.filter((s) => s.kind !== "warmup").length,
    volumeKg,
    plannedLeft: mine.filter((s) => !s.done).length,
    prs,
  };
}

export function describePR(pr: PR, unit: Unit): string {
  const w = (kg: number) => `${fmtNum(kgToDisplay(kg, unit))} ${unit}`;
  const total = (kg: number) => `${fmtInt(kgToDisplay(kg, unit))} ${unit}`;
  switch (pr.kind) {
    case "weight_at_reps":
      return `Heaviest for ${pr.reps} reps: ${w(pr.value)} (was ${w(pr.previous)})`;
    case "e1rm":
      return `Best est. 1RM: ${w(pr.value)} (estimated, was ${w(pr.previous)})`;
    case "most_reps":
      return `Most reps: ${fmtInt(pr.value)} (was ${fmtInt(pr.previous)})`;
    case "least_assist":
      return `Least assistance for ${pr.reps} reps: ${w(pr.value)} (was ${w(pr.previous)})`;
    case "longest_duration":
      return `Longest hold: ${pr.value}s (was ${pr.previous}s)`;
    case "session_volume":
      return `Best session volume: ${total(pr.value)} (was ${total(pr.previous)})`;
  }
}
