// Rolling schedule for a program. Days are done in order and repeat; there are no fixed weekdays.
// None of these functions touch `days` or slots: skipping or moving only changes `nextDayIndex`
// and appends to the append-only `scheduleLog`, so the plan itself is never lost.
//
// Pointer rules
// - Skip: log "skipped" for the day that was up next, pointer → following day.
// - Do a different day today: log "moved" for the chosen day and make it "up next"
//   (pointer → chosen day). The day you passed over isn't marked skipped; it simply comes up
//   again in its normal place in the rotation. Finishing the chosen day then advances from it.
// - Completed (a finished session linked to this program and day): log "completed",
//   pointer → the day after the one completed (even if it wasn't the one up next).
//   Logged once per session, keyed by sessionCid, so replays are no-ops.
// - Editing days keeps the same day "up next" by dayId; if that day was deleted the pointer
//   stays at the same position (clamped).

import type { ProgramData, ProgramDay, SessionData } from "../../shared/sync";

export type ScheduleEntry = ProgramData["scheduleLog"][number];

export function clampIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((Math.floor(i) % n) + n) % n;
}

export function nextDay(p: Pick<ProgramData, "days" | "nextDayIndex">): { day: ProgramDay; index: number } | null {
  if (p.days.length === 0) return null;
  const index = clampIndex(p.nextDayIndex, p.days.length);
  return { day: p.days[index]!, index };
}

export function skipDay(p: ProgramData, at: number): ProgramData {
  const cur = nextDay(p);
  if (!cur) return p;
  return {
    ...p,
    nextDayIndex: clampIndex(cur.index + 1, p.days.length),
    scheduleLog: [...p.scheduleLog, { at, dayId: cur.day.dayId, action: "skipped", sessionCid: null }],
  };
}

export function moveToDay(p: ProgramData, dayId: string, at: number): ProgramData {
  const idx = p.days.findIndex((d) => d.dayId === dayId);
  if (idx < 0) return p;
  const cur = nextDay(p);
  if (cur && cur.index === idx) return p;
  return {
    ...p,
    nextDayIndex: idx,
    scheduleLog: [...p.scheduleLog, { at, dayId, action: "moved", sessionCid: null }],
  };
}

export function applyCompletion(p: ProgramData, dayId: string, sessionCid: string, at: number): ProgramData {
  if (p.scheduleLog.some((e) => e.action === "completed" && e.sessionCid === sessionCid)) return p;
  const idx = p.days.findIndex((d) => d.dayId === dayId);
  return {
    ...p,
    nextDayIndex: idx >= 0 ? clampIndex(idx + 1, p.days.length) : p.nextDayIndex,
    scheduleLog: [...p.scheduleLog, { at, dayId, action: "completed", sessionCid }],
  };
}

/**
 * Log every finished session of this program that isn't logged yet, oldest first.
 * Returns the same object when nothing changed (callers can skip the write).
 */
export function reconcileCompletions(
  programCid: string,
  p: ProgramData,
  sessions: ReadonlyArray<{ cid: string; data: Pick<SessionData, "programCid" | "dayId" | "endedAt"> }>,
): ProgramData {
  const logged = new Set(p.scheduleLog.filter((e) => e.sessionCid).map((e) => e.sessionCid));
  const todo = sessions
    .filter((s) => s.data.programCid === programCid && s.data.dayId && s.data.endedAt != null && !logged.has(s.cid))
    .sort((a, b) => (a.data.endedAt ?? 0) - (b.data.endedAt ?? 0));
  let out = p;
  for (const s of todo) out = applyCompletion(out, s.data.dayId!, s.cid, s.data.endedAt!);
  return out;
}

/** Replace the day list (rename/add/remove/reorder) keeping the same day up next. */
export function replaceDays(p: ProgramData, days: ProgramDay[]): ProgramData {
  const cur = nextDay(p);
  let idx = cur ? days.findIndex((d) => d.dayId === cur.day.dayId) : 0;
  if (idx < 0) idx = cur ? Math.min(cur.index, Math.max(0, days.length - 1)) : 0;
  return { ...p, days, nextDayIndex: clampIndex(idx, days.length) };
}

export type TimelineItem = {
  at: number;
  action: ScheduleEntry["action"];
  dayId: string;
  /** Current day name, or a note when the day was later removed from the plan. */
  dayName: string;
  sessionCid: string | null;
};

/** Most recent schedule decisions first. */
export function timeline(p: Pick<ProgramData, "days" | "scheduleLog">, limit = 10): TimelineItem[] {
  const names = new Map(p.days.map((d) => [d.dayId, d.name]));
  return [...p.scheduleLog]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((e) => ({ ...e, dayName: names.get(e.dayId) ?? "Removed day" }));
}
