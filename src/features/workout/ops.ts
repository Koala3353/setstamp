// Every workout write goes through here: local store first (the outbox syncs it later).
import type { Tracking, Unit } from "../../shared/domain";
import type { PlannedSlot, ProgramData, ProgramDay, SessionData, SessionExerciseData, SetData, SettingsData, SyncDataMap, SyncTable } from "../../shared/sync";
import { newCid, type SyncStore } from "../../sync";
import { SETTINGS_CID } from "../session/hooks";
import { previousPerformance } from "../../logic/history";
import { progressionHint } from "../../logic/progression";
import { smallestIncrement } from "../../logic/units";
import { generateWarmups, type WarmupSet } from "../../logic/warmup";
import { TRACKING_FIELDS } from "../../logic/tracking";
import type { ExLookup } from "./exerciseInfo";

type Rows<T> = readonly { cid: string; data: T | null }[];

export type History = { sessions: Rows<SessionData>; sets: Rows<SetData> };

export function blankSet(p: Pick<SetData, "sessionCid" | "sessionExerciseCid" | "exId" | "order">): SetData {
  return { ...p, kind: "working", weightKg: null, entered: null, reps: null, assistKg: null, durationSec: null, distanceM: null, rpe: null, done: false, completedAt: null };
}

/** A warm-up set at `w`: reps for lifts; the working time or distance for holds and carries. */
export function warmupSet(
  base: Pick<SetData, "sessionCid" | "sessionExerciseCid" | "exId">,
  w: WarmupSet,
  tracking: Tracking,
  working: Pick<SetData, "durationSec" | "distanceM"> | null,
): SetData {
  const f = TRACKING_FIELDS[tracking];
  return {
    ...blankSet({ ...base, order: 0 }),
    kind: "warmup",
    weightKg: w.weightKg,
    reps: f.reps ? w.reps : null,
    durationSec: f.time ? (working?.durationSec ?? null) : null,
    distanceM: f.distance ? (working?.distanceM ?? null) : null,
  };
}

/** Planned copy of a logged set: same numbers, not done. */
function plannedFrom(src: SetData, p: Pick<SetData, "sessionCid" | "sessionExerciseCid" | "exId" | "order">): SetData {
  return { ...blankSet(p), kind: src.kind, weightKg: src.weightKg, entered: src.entered, reps: src.reps, assistKg: src.assistKg, durationSec: src.durationSec, distanceM: src.distanceM };
}

export async function createSession(store: SyncStore, data: Partial<SessionData> & { name: string }): Promise<string> {
  const cid = newCid();
  await store.write("sessions", cid, { startedAt: Date.now(), endedAt: null, programCid: null, dayId: null, notes: "", bodyweightKg: null, ...data });
  return cid;
}

/** Add an exercise to a session, pre-filling planned sets from last time (or one blank set). */
export async function addExercise(
  store: SyncStore,
  sessionCid: string,
  exId: string,
  order: number,
  history: History,
  opts: { slot?: PlannedSlot; settings?: SettingsData; lookup?: ExLookup; substitutedFromExId?: string | null; groupId?: string | null } = {},
): Promise<string> {
  const seCid = newCid();
  const slot = opts.slot;
  await store.write("sessionExercises", seCid, {
    sessionCid,
    exId,
    order,
    slotId: slot?.slotId ?? null,
    substitutedFromExId: opts.substitutedFromExId ?? null,
    notes: "",
    restSec: slot?.restSec ?? null,
    groupId: opts.groupId ?? slot?.groupId ?? null,
  });
  const prev = previousPerformance(exId, history.sessions, history.sets, sessionCid);
  const lastWorking = prev?.sets.filter((s) => s.kind !== "warmup") ?? [];
  const base = { sessionCid, sessionExerciseCid: seCid, exId };
  const planned: SetData[] = [];

  if (slot) {
    const info = opts.lookup?.(exId);
    const unit: Unit = opts.settings?.unit ?? "kg";
    const hint = info ? progressionHint(lastWorking, slot.repMin, slot.repMax, smallestIncrement(info.equipment, unit), unit) : null;
    for (let i = 0; i < Math.max(1, slot.sets); i++) {
      const src = lastWorking[Math.min(i, lastWorking.length - 1)];
      const s = src ? plannedFrom(src, { ...base, order: i }) : blankSet({ ...base, order: i });
      if (hint?.suggest && (hint.action === "increase" || hint.action === "hold" || hint.action === "add_reps")) {
        s.weightKg = hint.suggest.weightKg;
        s.entered = { value: hint.suggest.value, unit: hint.suggest.unit };
        if (hint.action === "increase") s.reps = slot.repMin ?? s.reps;
      }
      if (s.reps === null) s.reps = slot.repMin ?? slot.repMax;
      if (s.durationSec === null && slot.durationSec) s.durationSec = slot.durationSec;
      planned.push(s);
    }
    if (slot.warmup && info && opts.settings) {
      const top = planned[0]?.weightKg ?? null;
      const w = generateWarmups(top, { tracking: info.tracking, equipment: info.equipment, barKg: opts.settings.barKg, platesKg: opts.settings.platesKg, unit: opts.settings.unit });
      planned.unshift(...w.map((x) => warmupSet(base, x, info.tracking, planned[0] ?? null)));
    }
  } else if (lastWorking.length) {
    lastWorking.forEach((src, i) => planned.push(plannedFrom(src, { ...base, order: i })));
  } else {
    planned.push(blankSet({ ...base, order: 0 }));
  }
  planned.forEach((s, i) => (s.order = i));
  for (const s of planned) await store.write("sets", newCid(), s);
  return seCid;
}

/** Program day → session + its exercises + planned sets. */
export async function startProgramDay(
  store: SyncStore,
  programCid: string,
  program: ProgramData,
  day: ProgramDay,
  history: History,
  settings: SettingsData,
  lookup: ExLookup,
): Promise<string> {
  const sessionCid = await createSession(store, { name: day.name || program.name, programCid, dayId: day.dayId });
  let order = 0;
  for (const slot of day.slots) await addExercise(store, sessionCid, slot.exId, order++, history, { slot, settings, lookup });
  return sessionCid;
}

/** New session with the same exercises and numbers as a finished one (planned, not done). */
export async function repeatSession(
  store: SyncStore,
  srcCid: string,
  src: SessionData,
  exercises: readonly { cid: string; data: SessionExerciseData | null }[],
  sets: readonly { cid: string; data: SetData | null }[],
): Promise<string> {
  const sessionCid = await createSession(store, { name: src.name });
  const ses = exercises.filter((r) => r.data?.sessionCid === srcCid).sort((a, b) => a.data!.order - b.data!.order);
  for (const [i, r] of ses.entries()) {
    const se = r.data!;
    const seCid = newCid();
    await store.write("sessionExercises", seCid, { ...se, sessionCid, order: i, notes: "" });
    const ss = sets
      .filter((s) => s.data?.sessionExerciseCid === r.cid && s.data.done)
      .map((s) => s.data!)
      .sort((a, b) => a.order - b.order);
    for (const [j, s] of ss.entries()) await store.write("sets", newCid(), plannedFrom(s, { sessionCid, sessionExerciseCid: seCid, exId: se.exId, order: j }));
  }
  return sessionCid;
}

/** Mark a program day completed and advance the rolling queue past it. */
export async function completeProgramDay(store: SyncStore, programCid: string, dayId: string, sessionCid: string): Promise<void> {
  const row = store.get("programs", programCid);
  const p = row?.data;
  if (!p) return;
  const idx = p.days.findIndex((d) => d.dayId === dayId);
  const nextDayIndex = idx >= 0 && p.days.length ? (idx + 1) % p.days.length : p.nextDayIndex;
  await store.write("programs", programCid, {
    ...p,
    nextDayIndex,
    scheduleLog: [...p.scheduleLog, { at: Date.now(), dayId, action: "completed", sessionCid }],
  });
}

/** One row as it was before a change. */
export type SnapRow = { [T in SyncTable]: { table: T; cid: string; data: SyncDataMap[T] } }[SyncTable];
/**
 * Snapshot of rows for undo: rewriting them restores exactly what was deleted or changed. Parents
 * come before children, so restoring in order never shows a set without its workout.
 */
export type Snapshot = SnapRow[];

/** Tombstone every row in the snapshot, children first (a half-done delete never leaves orphans). */
export async function removeRows(store: SyncStore, snap: Snapshot): Promise<void> {
  for (const r of [...snap].reverse()) await store.remove(r.table, r.cid);
}
/** Re-upsert the snapshot. Local writes always get a newer updatedAt, so they win over the tombstones. */
export async function restoreRows(store: SyncStore, snap: Snapshot): Promise<void> {
  for (const r of snap) await store.write(r.table, r.cid, r.data as never);
}

function snapOf<T extends SyncTable>(store: SyncStore, table: T, cid: string): SnapRow | null {
  const d = store.get(table, cid)?.data;
  return d ? ({ table, cid, data: d } as SnapRow) : null;
}

/** A workout with every exercise and set in it (orphan sets of the session included). */
export function sessionSnapshot(store: SyncStore, sessionCid: string): Snapshot {
  const out: Snapshot = [];
  const s = snapOf(store, "sessions", sessionCid);
  if (s) out.push(s);
  for (const r of store.list("sessionExercises")) if (r.data?.sessionCid === sessionCid) out.push({ table: "sessionExercises", cid: r.cid, data: r.data });
  for (const r of store.list("sets")) if (r.data?.sessionCid === sessionCid) out.push({ table: "sets", cid: r.cid, data: r.data });
  return out;
}

/** Delete a workout and everything logged in it. Returns the snapshot for Undo. */
export async function deleteSession(store: SyncStore, sessionCid: string): Promise<Snapshot> {
  const snap = sessionSnapshot(store, sessionCid);
  await removeRows(store, snap);
  return snap;
}

/** `at` moved to the calendar date `ymd` (YYYY-MM-DD, local), same time of day. Bad input: unchanged. */
export function moveToDate(at: number, ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return at;
  const d = new Date(at);
  d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? at : d.getTime();
}

/**
 * Edit a logged workout's name, notes and start. Moving the start moves the end and every set's
 * completion time by the same amount, so durations and per-day history stay consistent.
 */
export async function updateSessionDetails(
  store: SyncStore,
  sessionCid: string,
  patch: Partial<Pick<SessionData, "name" | "notes" | "startedAt">>,
): Promise<void> {
  const cur = store.get("sessions", sessionCid)?.data;
  if (!cur) return;
  const shift = patch.startedAt !== undefined ? patch.startedAt - cur.startedAt : 0;
  await store.write("sessions", sessionCid, {
    ...cur,
    ...patch,
    endedAt: cur.endedAt === null ? null : cur.endedAt + shift,
  });
  if (!shift) return;
  for (const r of store.list("sets")) {
    const s = r.data;
    if (s?.sessionCid === sessionCid && s.completedAt !== null) await store.write("sets", r.cid, { ...s, completedAt: s.completedAt + shift });
  }
}

/** Settings row before clearing an active program pointer, or null when `programCid` isn't active. */
async function deactivate(store: SyncStore, programCid: string): Promise<SnapRow | null> {
  const row = store.get("settings", SETTINGS_CID)?.data;
  if (!row || row.activeProgramCid !== programCid) return null;
  await store.write("settings", SETTINGS_CID, { ...row, activeProgramCid: null });
  return { table: "settings", cid: SETTINGS_CID, data: row };
}

/**
 * Delete a program. Workouts done from it stay (they keep their programCid; the history doesn't
 * need the program). If it was active, nothing is active afterwards. Returns the snapshot for Undo.
 */
export async function deleteProgram(store: SyncStore, programCid: string): Promise<Snapshot> {
  const p = snapOf(store, "programs", programCid);
  if (!p) return [];
  const settings = await deactivate(store, programCid);
  await store.remove("programs", programCid);
  return settings ? [p, settings] : [p];
}

/** Archive (hide) or unarchive a program. Archiving the active one deactivates it. Returns Undo. */
export async function setProgramArchived(store: SyncStore, programCid: string, archived: boolean): Promise<Snapshot> {
  const p = store.get("programs", programCid)?.data;
  if (!p) return [];
  const snap: Snapshot = [{ table: "programs", cid: programCid, data: p }];
  if (archived) {
    const settings = await deactivate(store, programCid);
    if (settings) snap.push(settings);
  }
  await store.write("programs", programCid, { ...p, archived });
  return snap;
}

/**
 * Delete a custom exercise and its favorite. Logged sets keep their exId; history shows
 * "Deleted exercise" for it (see exerciseInfo). Returns the snapshot for Undo.
 */
export async function deleteCustomExercise(store: SyncStore, cid: string): Promise<Snapshot> {
  const cx = snapOf(store, "customExercises", cid);
  if (!cx || cx.table !== "customExercises") return [];
  const snap: Snapshot = [cx];
  for (const r of store.list("favorites")) if (r.data?.exId === cx.data.exId) snap.push({ table: "favorites", cid: r.cid, data: r.data });
  await removeRows(store, snap);
  return snap;
}

type SeRow = { cid: string; data: SessionExerciseData };

/**
 * Write a new order / grouping of a session's exercises (from src/logic/superset), touching only
 * rows that changed. Returns the previous data of those rows so the change can be undone.
 */
export async function writeLayout(store: SyncStore, before: readonly SeRow[], after: readonly SeRow[]): Promise<Snapshot> {
  const prev = new Map(before.map((r) => [r.cid, r.data]));
  const undo: Snapshot = [];
  for (const [i, r] of after.entries()) {
    const old = prev.get(r.cid);
    const next = { ...r.data, order: i, groupId: r.data.groupId ?? null };
    if (old && old.order === next.order && (old.groupId ?? null) === next.groupId) continue;
    if (old) undo.push({ table: "sessionExercises", cid: r.cid, data: old });
    await store.write("sessionExercises", r.cid, next);
  }
  return undo;
}
