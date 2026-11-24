// Every workout write goes through here: local store first (the outbox syncs it later).
import type { Unit } from "../../shared/domain";
import type { PlannedSlot, ProgramData, ProgramDay, SessionData, SessionExerciseData, SetData, SettingsData } from "../../shared/sync";
import { newCid, type SyncStore } from "../../sync";
import { previousPerformance } from "../../logic/history";
import { progressionHint } from "../../logic/progression";
import { smallestIncrement } from "../../logic/units";
import { generateWarmups } from "../../logic/warmup";
import type { ExLookup } from "./exerciseInfo";

type Rows<T> = readonly { cid: string; data: T | null }[];

export type History = { sessions: Rows<SessionData>; sets: Rows<SetData> };

export function blankSet(p: Pick<SetData, "sessionCid" | "sessionExerciseCid" | "exId" | "order">): SetData {
  return { ...p, kind: "working", weightKg: null, entered: null, reps: null, assistKg: null, durationSec: null, distanceM: null, rpe: null, done: false, completedAt: null };
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
  opts: { slot?: PlannedSlot; settings?: SettingsData; lookup?: ExLookup; substitutedFromExId?: string | null } = {},
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
      planned.unshift(...w.map((x) => ({ ...blankSet({ ...base, order: 0 }), kind: "warmup" as const, weightKg: x.weightKg, entered: null, reps: x.reps })));
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

/** Snapshot of rows for undo: rewriting them restores exactly what was deleted. */
export type Snapshot = Array<{ table: "sessionExercises" | "sets"; cid: string; data: SessionExerciseData | SetData }>;

export async function removeRows(store: SyncStore, snap: Snapshot): Promise<void> {
  for (const r of snap) await store.remove(r.table, r.cid);
}
export async function restoreRows(store: SyncStore, snap: Snapshot): Promise<void> {
  for (const r of snap) {
    if (r.table === "sets") await store.write("sets", r.cid, r.data as SetData);
    else await store.write("sessionExercises", r.cid, r.data as SessionExerciseData);
  }
}
