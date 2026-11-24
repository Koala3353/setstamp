// The active session: the screen a lifter uses between sets. Every common action is one tap.
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useActiveWorkout } from "../../app/activeWorkout";
import { navigate } from "../../app/router";
import { ScreenAction } from "../../app/Shell";
import { formatDuration, useNow } from "../../app/useNow";
import type { Muscle } from "../../shared/domain";
import type { PlannedSlot, SessionExerciseData, SetData } from "../../shared/sync";
import { newCid } from "../../sync";
import { useRows, useSyncStore } from "../../sync/react";
import { Button, Card, EmptyState, IconDumbbell, IconPlus, IconRecord, Sheet, Stat, StatGrid, useToast } from "../../ui";
import { previousPerformance } from "../../logic/history";
import { progressionHint } from "../../logic/progression";
import { fmtInt, fmtNum, kgToDisplay, smallestIncrement } from "../../logic/units";
import { generateWarmups } from "../../logic/warmup";
import { canLog } from "../../logic/tracking";
import { afterLog, groupRest, linkWithNext, moveItem, nextInGroup, removeAt, supersetRuns, unlink, type RoundMember, type SupersetRun } from "../../logic/superset";
import { useUserSettings } from "../session/hooks";
import { ExercisePicker } from "../exercises/ExercisePicker";
import { ExerciseCard, type SetRow } from "./ExerciseCard";
import { useExerciseLookup } from "./exerciseInfo";
import { addExercise, blankSet, completeProgramDay, removeRows, restoreRows, warmupSet, writeLayout, type Snapshot } from "./ops";
import { RestBar } from "./RestBar";
import { rest } from "./restTimer";
import { SetEditor } from "./SetEditor";
import { describePR, summarize } from "./summary";
import { useOpenSession } from "./useWorkout";
import "./workout.css";

type Picker = { mode: "add" } | { mode: "superset" } | { mode: "substitute"; seCid: string } | null;
type SeRow = { cid: string; data: SessionExerciseData };
/** A session exercise as a superset item (src/logic/superset works on top-level groupId). */
type Item = SeRow & { groupId: string | null };

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Bring the next set into view and give its ✓ keyboard focus, so the round flows on. */
function focusSet(cid: string) {
  requestAnimationFrame(() => {
    const li = document.querySelector<HTMLElement>(`[data-set="${CSS.escape(cid)}"]`);
    if (!li) return;
    li.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    li.querySelector<HTMLButtonElement>(".wk-set__check")?.focus({ preventScroll: true });
  });
}

export function WorkoutView() {
  const open = useOpenSession();
  const store = useSyncStore();
  const { finish } = useActiveWorkout();
  const toast = useToast();
  const settings = useUserSettings();
  const lookup = useExerciseLookup();
  const sessions = useRows("sessions");
  const allSets = useRows("sets");
  const allSe = useRows("sessionExercises");
  const programs = useRows("programs");
  const now = useNow(1000);

  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [confirm, setConfirm] = useState<"finish" | "discard" | null>(null);

  const sessionCid = open?.cid ?? null;
  const exercises = useMemo(
    () =>
      allSe
        .filter((r) => r.data?.sessionCid === sessionCid)
        .map((r) => ({ cid: r.cid, data: r.data as SessionExerciseData }))
        .sort((a, b) => a.data.order - b.data.order),
    [allSe, sessionCid],
  );
  const setsBySe = useMemo(() => {
    const m = new Map<string, SetRow[]>();
    for (const r of allSets) {
      const s = r.data;
      if (!s || s.sessionCid !== sessionCid) continue;
      const list = m.get(s.sessionExerciseCid) ?? [];
      list.push({ cid: r.cid, data: s });
      m.set(s.sessionExerciseCid, list);
    }
    for (const l of m.values()) l.sort((a, b) => a.data.order - b.data.order);
    return m;
  }, [allSets, sessionCid]);

  const slots = useMemo(() => {
    const m = new Map<string, PlannedSlot>();
    const prog = open?.data.programCid ? programs.find((p) => p.cid === open.data.programCid)?.data : null;
    for (const d of prog?.days ?? []) for (const s of d.slots) m.set(s.slotId, s);
    return m;
  }, [programs, open]);

  const history = useMemo(() => ({ sessions, sets: allSets }), [sessions, allSets]);
  const prevFor = useCallback((exId: string) => previousPerformance(exId, sessions, allSets, sessionCid), [sessions, allSets, sessionCid]);

  const editingRow = useMemo(() => {
    if (!editing) return null;
    for (const [seCid, list] of setsBySe) {
      const row = list.find((r) => r.cid === editing);
      if (row) return { row, se: exercises.find((e) => e.cid === seCid) ?? null };
    }
    return null;
  }, [editing, setsBySe, exercises]);

  if (!open || !store) {
    return (
      <div className="screen">
        <EmptyState
          icon={<IconDumbbell />}
          title="No workout running"
          action={
            <Button variant="secondary" onClick={() => navigate("/", { replace: true })}>
              Back to Today
            </Button>
          }
        >
          <p>Start one from Today. It keeps running if you switch apps or lose signal.</p>
        </EmptyState>
        <RestBar />
      </div>
    );
  }

  const session = open.data;
  const unit = settings.unit;

  const restFor = (se: SessionExerciseData) => se.restSec ?? (se.slotId ? slots.get(se.slotId)?.restSec : null) ?? settings.defaultRestSec;

  /** Values a fresh set starts from: the previous set in this card, else last session's matching set. */
  const sourceFor = (seCid: string, exId: string, index: number): SetData | null => {
    const list = setsBySe.get(seCid) ?? [];
    const before = list
      .slice(0, index)
      .reverse()
      .find((r) => r.data.kind !== "warmup" && (r.data.weightKg !== null || r.data.reps !== null || r.data.durationSec !== null || r.data.distanceM !== null));
    if (before) return before.data;
    const prev = prevFor(exId)?.sets.filter((s) => s.kind !== "warmup") ?? [];
    const workingIdx = list.slice(0, index).filter((r) => r.data.kind !== "warmup").length;
    return prev[Math.min(workingIdx, prev.length - 1)] ?? null;
  };

  const fill = (s: SetData, src: SetData | null): SetData =>
    src
      ? {
          ...s,
          weightKg: s.weightKg ?? src.weightKg,
          entered: s.weightKg === null ? src.entered : s.entered,
          reps: s.reps ?? src.reps,
          assistKg: s.assistKg ?? src.assistKg,
          durationSec: s.durationSec ?? src.durationSec,
          distanceM: s.distanceM ?? src.distanceM,
        }
      : s;

  // Supersets: adjacent exercises sharing a groupId. Older rows have no groupId (= not grouped).
  const items: Item[] = exercises.map((e) => ({ ...e, groupId: e.data.groupId ?? null }));
  const runs = supersetRuns(items);
  const runAt = (i: number): SupersetRun | null => runs.find((r) => i >= r.start && i <= r.end) ?? null;
  const membersOf = (run: SupersetRun): RoundMember[] =>
    exercises.slice(run.start, run.end + 1).map((e) => ({ key: e.cid, sets: (setsBySe.get(e.cid) ?? []).map((r) => ({ cid: r.cid, kind: r.data.kind, done: r.data.done })) }));
  const runRest = (run: SupersetRun) => groupRest(exercises.slice(run.start, run.end + 1).map((e) => restFor(e.data)));

  const doLog = (row: SetRow, data: SetData, se: { cid: string; data: SessionExerciseData } | null) => {
    void store.write("sets", row.cid, { ...data, done: true, completedAt: Date.now() });
    if (!se) return;
    const idx = exercises.findIndex((e) => e.cid === se.cid);
    const run = idx >= 0 ? runAt(idx) : null;
    if (!run) {
      if (data.kind !== "warmup") rest.start(restFor(se.data), lookup(se.data.exId).name);
      return;
    }
    // In a superset: move on to the next exercise of the round; rest only once the round is done.
    const next = afterLog(membersOf(run), row.cid);
    if (data.kind !== "warmup") {
      if (next.rest) rest.start(runRest(run), `Superset ${run.label}`);
      else rest.skip();
    }
    if (next.next && !(setsBySe.get(se.cid) ?? []).some((r) => r.cid === next.next)) focusSet(next.next);
  };

  /** Save a new order / grouping; `message` offers Undo. */
  const applyLayout = async (next: Item[] | null, message?: string) => {
    if (!next) return;
    const undo = await writeLayout(
      store,
      exercises,
      next.map((x) => ({ cid: x.cid, data: { ...x.data, groupId: x.groupId } })),
    );
    if (message && undo.length) toast.show({ message, action: { label: "Undo", onAction: () => void restoreRows(store, undo) } });
  };

  const deleteSet = (row: SetRow) => {
    const snap: Snapshot = [{ table: "sets", cid: row.cid, data: row.data }];
    void removeRows(store, snap);
    setEditing(null);
    toast.show({ message: "Set deleted", action: { label: "Undo", onAction: () => void restoreRows(store, snap) } });
  };

  const removeExercise = async (se: { cid: string; data: SessionExerciseData }) => {
    const i = exercises.findIndex((e) => e.cid === se.cid);
    const snap: Snapshot = [
      { table: "sessionExercises", cid: se.cid, data: se.data },
      ...(setsBySe.get(se.cid) ?? []).map((r) => ({ table: "sets" as const, cid: r.cid, data: r.data })),
    ];
    await removeRows(store, snap);
    // A superset left with one exercise dissolves; undo puts the group back too.
    const left = removeAt(items, i);
    const changed = await writeLayout(
      store,
      exercises.filter((e) => e.cid !== se.cid),
      left.map((x) => ({ cid: x.cid, data: { ...x.data, groupId: x.groupId } })),
    );
    const all = [...snap, ...changed];
    toast.show({ message: `${lookup(se.data.exId).name} removed`, action: { label: "Undo", onAction: () => void restoreRows(store, all) } });
  };

  const addSet = (se: { cid: string; data: SessionExerciseData }) => {
    const list = setsBySe.get(se.cid) ?? [];
    const order = (list[list.length - 1]?.data.order ?? -1) + 1;
    const s = fill(blankSet({ sessionCid: open.cid, sessionExerciseCid: se.cid, exId: se.data.exId, order }), sourceFor(se.cid, se.data.exId, list.length));
    void store.write("sets", newCid(), s);
  };

  const addWarmups = async (se: { cid: string; data: SessionExerciseData }) => {
    const list = setsBySe.get(se.cid) ?? [];
    const info = lookup(se.data.exId);
    const firstWorking = list.find((r) => r.data.kind !== "warmup" && r.data.weightKg !== null)?.data ?? prevFor(se.data.exId)?.sets.find((s) => s.kind !== "warmup") ?? null;
    const top = firstWorking?.weightKg ?? null;
    const w = generateWarmups(top, { tracking: info.tracking, equipment: info.equipment, barKg: settings.barKg, platesKg: settings.platesKg, unit });
    if (!w.length) {
      toast.show({ message: top === null ? "Set a working weight first" : "No warm-ups needed at this weight" });
      return;
    }
    for (const [i, r] of list.entries()) await store.write("sets", r.cid, { ...r.data, order: w.length + i });
    const base = { sessionCid: open.cid, sessionExerciseCid: se.cid, exId: se.data.exId };
    for (const [i, x] of w.entries()) await store.write("sets", newCid(), { ...warmupSet(base, x, info.tracking, firstWorking), order: i });
    const reps = info.tracking === "weight_reps";
    toast.show({ message: `Added ${w.length} warm-up sets: ${w.map((x) => `${fmtNum(kgToDisplay(x.weightKg, unit))}${reps ? `×${x.reps}` : ` ${unit}`}`).join(", ")}` });
  };

  const onPick = async (exId: string) => {
    const p = picker;
    setPicker(null);
    if (!p) return;
    if (p.mode === "add" || p.mode === "superset") {
      const order = (exercises[exercises.length - 1]?.data.order ?? -1) + 1;
      await addExercise(store, open.cid, exId, order, history, { settings, lookup });
      return;
    }
    const se = exercises.find((e) => e.cid === p.seCid);
    if (!se || se.data.exId === exId) return;
    await store.write("sessionExercises", se.cid, { ...se.data, exId, substitutedFromExId: se.data.substitutedFromExId ?? se.data.exId });
    const prev = prevFor(exId)?.sets.filter((s) => s.kind !== "warmup") ?? [];
    let i = 0;
    for (const r of setsBySe.get(se.cid) ?? []) {
      if (r.data.done) continue;
      const src = r.data.kind === "warmup" ? null : (prev[Math.min(i++, prev.length - 1)] ?? null);
      const base = { ...r.data, exId, weightKg: null, entered: null, assistKg: null, durationSec: null, distanceM: null };
      await store.write("sets", r.cid, src ? fill(base, src) : { ...base, reps: r.data.reps });
    }
  };

  /** Several exercises at once, linked as one superset (one pick just adds it). */
  const onPickSuperset = async (exIds: string[]) => {
    setPicker(null);
    const groupId = exIds.length >= 2 ? newCid() : null;
    let order = (exercises[exercises.length - 1]?.data.order ?? -1) + 1;
    for (const exId of exIds) await addExercise(store, open.cid, exId, order++, history, { settings, lookup, groupId });
  };

  // The one set to log next, in card order (supersets go round by round): its ✓ carries the screen's single orange.
  let nextCid: string | null = null;
  for (let i = 0; i < exercises.length && nextCid === null; i++) {
    const run = runAt(i);
    if (run) {
      nextCid = nextInGroup(membersOf(run));
      i = run.end;
    } else nextCid = (setsBySe.get(exercises[i]!.cid) ?? []).find((r) => !r.data.done)?.cid ?? null;
  }
  const allWorking = [...setsBySe.values()].flat().filter((r) => r.data.kind !== "warmup");
  const plannedWorking = allWorking.length;
  const doneWorking = allWorking.filter((r) => r.data.done).length;
  // Every set ticked: finishing becomes the next thing to do.
  const readyToFinish = nextCid === null && doneWorking > 0;

  const sessionMuscles = [...new Set(exercises.flatMap((e) => lookup(e.data.exId).primary))] as Muscle[];
  const summary = confirm === "finish" ? summarize(open.cid, session, allSe, sessions, allSets, lookup) : null;

  const doFinish = async () => {
    const endedAt = Date.now();
    await store.write("sessions", open.cid, { ...session, endedAt });
    if (session.programCid && session.dayId) await completeProgramDay(store, session.programCid, session.dayId, open.cid);
    rest.skip();
    finish();
    setConfirm(null);
    toast.show({ message: "Workout saved" });
    navigate("/", { replace: true });
  };

  const doDiscard = async () => {
    const snap: Snapshot = [
      ...exercises.map((e) => ({ table: "sessionExercises" as const, cid: e.cid, data: e.data })),
      ...[...setsBySe.values()].flat().map((r) => ({ table: "sets" as const, cid: r.cid, data: r.data })),
    ];
    await removeRows(store, snap);
    await store.remove("sessions", open.cid);
    rest.skip();
    // No finish() here: it writes endedAt onto the session it last saw, which would bring the
    // just-removed session back as an empty finished workout. Removing it already ends it.
    setConfirm(null);
    toast.show({ message: "Workout discarded" });
    navigate("/", { replace: true });
  };

  const renderCard = (i: number) => {
    const se = exercises[i]!;
    const info = lookup(se.data.exId);
    const slot = se.data.slotId ? (slots.get(se.data.slotId) ?? null) : null;
    const prev = prevFor(se.data.exId);
    const hint = slot && prev ? progressionHint(prev.sets, slot.repMin, slot.repMax, smallestIncrement(info.equipment, unit), unit) : null;
    const sets = setsBySe.get(se.cid) ?? [];
    const run = runAt(i);
    const next = items[i + 1];
    return (
      <ExerciseCard
        key={se.cid}
        info={info}
        substitutedFrom={se.data.substitutedFromExId ? lookup(se.data.substitutedFromExId).name : null}
        notes={se.data.notes}
        restSec={se.data.restSec}
        sets={sets}
        prev={prev}
        slot={slot}
        hint={hint}
        settings={settings}
        nextCid={nextCid}
        superset={run ? { label: run.label, restSec: runRest(run) } : null}
        actions={{
          logSet: (row) => {
            if (row.data.done) void store.write("sets", row.cid, { ...row.data, done: false, completedAt: null });
            else {
              const data = fill(row.data, sourceFor(se.cid, se.data.exId, sets.indexOf(row)));
              // Nothing to prefill from (e.g. first time on a lift): ask for the numbers rather than log "– × 6".
              if (!canLog(data, info.tracking)) setEditing(row.cid);
              else doLog(row, data, se);
            }
          },
          preview: (row) => fill(row.data, sourceFor(se.cid, se.data.exId, sets.indexOf(row))),
          editSet: (row) => setEditing(row.cid),
          addSet: () => addSet(se),
          moveUp: moveItem(items, i, -1) ? () => void applyLayout(moveItem(items, i, -1)) : undefined,
          moveDown: moveItem(items, i, 1) ? () => void applyLayout(moveItem(items, i, 1)) : undefined,
          substitute: () => setPicker({ mode: "substitute", seCid: se.cid }),
          addWarmups: () => void addWarmups(se),
          remove: () => void removeExercise(se),
          setNotes: (notes) => void store.write("sessionExercises", se.cid, { ...se.data, notes }),
          setRest: (restSec) => void store.write("sessionExercises", se.cid, { ...se.data, restSec }),
          supersetNext:
            next && (run === null || next.groupId !== run.groupId)
              ? () => void applyLayout(linkWithNext(items, i, newCid()), `${info.name} and ${lookup(next.data.exId).name} are a superset`)
              : undefined,
          leaveSuperset: run ? () => void applyLayout(unlink(items, i), `${info.name} left the superset`) : undefined,
        }}
      />
    );
  };

  /** Ungrouped cards alone; a superset as one bracketed block whose cards are done round by round. */
  const blocks: ReactNode[] = [];
  for (let i = 0; i < exercises.length; i++) {
    const run = runAt(i);
    if (!run) {
      blocks.push(renderCard(i));
      continue;
    }
    blocks.push(
      <section key={`ss-${run.groupId}`} className="wk-superset" aria-label={`Superset ${run.label}`}>
        <header className="wk-superset__head">
          <span className="wk-superset__label">Superset {run.label}</span>
          <span className="wk-superset__meta">
            {run.end - run.start + 1} exercises · rest <span className="num">{formatDuration(runRest(run))}</span> after each round
          </span>
        </header>
        <div className="wk-superset__cards">{exercises.slice(run.start, run.end + 1).map((_, k) => renderCard(run.start + k))}</div>
      </section>,
    );
    i = run.end;
  }

  const editSe = editingRow?.se ?? null;
  const editInfo = editSe ? lookup(editSe.data.exId) : null;
  const editIdx = editingRow && editSe ? (setsBySe.get(editSe.cid) ?? []).findIndex((r) => r.cid === editingRow.row.cid) : -1;
  const editSet = editingRow && editSe ? fill(editingRow.row.data, editingRow.row.data.done ? null : sourceFor(editSe.cid, editSe.data.exId, editIdx)) : null;

  return (
    <div className="screen wk">
      <div className="wk-status">
        <div className="clock" aria-label={`Elapsed ${formatDuration((now - session.startedAt) / 1000)}`}>
          <span className="clock__value num">{formatDuration((now - session.startedAt) / 1000)}</span>
          <span className="clock__label">elapsed</span>
        </div>
        {plannedWorking > 0 && (
          <div className="wk-progress">
            <span className="wk-progress__text">
              <span className="num">{doneWorking}</span> of <span className="num">{plannedWorking}</span> sets
            </span>
            <span className="wk-progress__track" aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.min(1, doneWorking / plannedWorking)})` }} />
            </span>
          </div>
        )}
      </div>

      {exercises.length === 0 && (
        <EmptyState icon={<IconDumbbell />} title="Add your first exercise">
          <p>Search by name, nickname or muscle. Your last numbers fill in as you go.</p>
        </EmptyState>
      )}

      {blocks}

      <div className="wk-add">
        <Button variant="secondary" block icon={<IconPlus size={20} />} onClick={() => setPicker({ mode: "add" })}>
          Add exercise
        </Button>
        <Button variant="ghost" onClick={() => setPicker({ mode: "superset" })}>
          Add superset
        </Button>
      </div>

      <label className="wk-field wk-notes">
        <span className="wk-field__label">Session notes</span>
        <textarea
          rows={2}
          defaultValue={session.notes}
          placeholder="Sleep, energy, anything worth remembering"
          onBlur={(e) => {
            const notes = e.currentTarget.value;
            if (notes !== session.notes) void store.write("sessions", open.cid, { ...session, notes });
          }}
        />
      </label>

      <Button variant="ghost" className="wk-discard" onClick={() => setConfirm("discard")}>
        Discard workout
      </Button>

      <ScreenAction>
        <div className="wk-dock">
          <RestBar />
          <Button variant={readyToFinish ? "primary" : "secondary"} size="lg" block onClick={() => setConfirm("finish")}>
            Finish workout
          </Button>
        </div>
      </ScreenAction>

      {editSet && editInfo && editingRow && (
        <SetEditor
          key={editingRow.row.cid}
          open
          set={editSet}
          info={editInfo}
          settings={settings}
          title={`${editInfo.name} · ${editSet.kind === "warmup" ? "warm-up" : "set"}`}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const cur = editingRow.row.data;
            if (JSON.stringify(next) !== JSON.stringify(cur)) void store.write("sets", editingRow.row.cid, next);
          }}
          onLog={(next) => {
            setEditing(null);
            if (editingRow.row.data.done) void store.write("sets", editingRow.row.cid, next);
            else doLog(editingRow.row, next, editSe);
          }}
          onDelete={() => deleteSet(editingRow.row)}
        />
      )}

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(exId: string) => void onPick(exId)}
        multi={picker?.mode === "superset"}
        onPickMany={(ids: string[]) => void onPickSuperset(ids)}
        title={picker?.mode === "superset" ? "Pick exercises for a superset" : undefined}
        mode={picker?.mode === "substitute" ? "substitute" : "add"}
        substituteFor={picker?.mode === "substitute" ? exercises.find((e) => e.cid === picker.seCid)?.data.exId : undefined}
        sessionMuscles={sessionMuscles}
      />

      <Sheet
        open={confirm === "finish"}
        onClose={() => setConfirm(null)}
        title="Finish workout?"
        footer={
          <div className="sheet-actions">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep going
            </Button>
            <Button variant="primary" onClick={() => void doFinish()}>
              Finish
            </Button>
          </div>
        }
      >
        {summary && (
          <div className="wk-summary">
            <StatGrid className="wk-summary__stats">
              <Stat label="Time" value={formatDuration(summary.durationSec)} />
              <Stat label="Working sets" value={summary.setsDone} />
              <Stat label="Volume" value={fmtInt(kgToDisplay(summary.volumeKg, unit) ?? 0)} unit={unit} />
            </StatGrid>
            {summary.prs.length > 0 && (
              <Card tone="record" as="section" className="wk-summary__prs" aria-label="Personal records">
                <p className="wk-summary__prs-title">
                  <IconRecord size={20} /> {summary.prs.length === 1 ? "New record" : `${summary.prs.length} new records`}
                </p>
                <ul>
                  {summary.prs.map((p, k) => (
                    <li key={k}>
                      <strong>{p.exName}</strong> <span>{describePR(p.pr, unit)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {summary.plannedLeft > 0 && <p className="muted">{summary.plannedLeft === 1 ? "1 planned set wasn't ticked. It stays" : `${summary.plannedLeft} planned sets weren't ticked. They stay`} in the plan, not your history.</p>}
            {session.programCid && session.dayId && <p className="muted">Finishing marks this program day done and moves the queue on.</p>}
            <p className="muted small">Volume counts working sets only (weight × reps). Est. 1RM uses the Epley formula on sets of up to 10 reps.</p>
          </div>
        )}
      </Sheet>

      <Sheet
        open={confirm === "discard"}
        onClose={() => setConfirm(null)}
        title="Discard this workout?"
        description="Every set in it is deleted. This can't be undone."
        footer={
          <div className="sheet-actions ui-hazard">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => void doDiscard()}>
              Discard
            </Button>
          </div>
        }
      >
        <p className="muted">
          {[...setsBySe.values()].flat().filter((r) => r.data.done).length} logged sets across {exercises.length} exercises.
        </p>
      </Sheet>
    </div>
  );
}

