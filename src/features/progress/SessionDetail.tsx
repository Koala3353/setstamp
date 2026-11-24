// One finished (or in-progress) workout: totals, records set that day, and every exercise's sets.
// Reachable at #/progress?session=<cid> (the program timeline links here).
// A finished workout can be fixed after the fact: name, date, notes, any set, or deleted (with Undo).
import { useMemo, useState } from "react";
import { goBack, href, pathFor } from "../../app/router";
import type { SetData } from "../../shared/sync";
import { useRows, useSyncStore } from "../../sync/react";
import { Button, Card, EmptyState, IconChevronLeft, IconChevronRight, IconHistory, IconTrash, SectionHeader, Stat, StatGrid, useToast } from "../../ui";
import { DeleteSessionSheet, SessionEditSheet, useDeleteSession } from "../history/SessionActions";
import { useUserSettings } from "../session/hooks";
import { SetEditor } from "../workout/SetEditor";
import { removeRows, restoreRows, type Snapshot } from "../workout/ops";
import { useExerciseLookup } from "../workout/exerciseInfo";
import { describePR, summarize } from "../workout/summary";
import { fmtDate, fmtMinutes, fmtSet, fmtVolume, KIND_LABEL } from "./format";
import { MetricsHelp } from "./MetricsSheet";

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function SessionDetail({ sessionCid }: { sessionCid: string }) {
  const sessions = useRows("sessions");
  const sessionExercises = useRows("sessionExercises");
  const sets = useRows("sets");
  const lookup = useExerciseLookup();
  const settings = useUserSettings();
  const { unit } = settings;
  const store = useSyncStore();
  const toast = useToast();
  const removeSession = useDeleteSession(store);
  const [sheet, setSheet] = useState<"edit" | "delete" | null>(null);
  const [editingSet, setEditingSet] = useState<string | null>(null);

  const session = sessions.find((r) => r.cid === sessionCid)?.data ?? null;

  const view = useMemo(() => {
    if (!session) return null;
    // Records are judged only against sessions that came before this one.
    const earlier = sessions.filter((r) => r.data && r.data.startedAt < session.startedAt);
    const summary = summarize(sessionCid, session, sessionExercises, earlier, sets, lookup);
    const mine = sets
      .filter((r): r is typeof r & { data: SetData } => !!r.data && r.data.sessionCid === sessionCid)
      .map((r) => ({ ...r.data, cid: r.cid }));
    const exercises = sessionExercises
      .map((r) => ({ cid: r.cid, d: r.data }))
      .filter((r): r is { cid: string; d: NonNullable<typeof r.d> } => !!r.d && r.d.sessionCid === sessionCid)
      .sort((a, b) => a.d.order - b.d.order)
      .map(({ cid, d }) => ({
        cid,
        exId: d.exId,
        notes: d.notes,
        substitutedFrom: d.substitutedFromExId,
        sets: mine.filter((s) => s.sessionExerciseCid === cid).sort((a, b) => a.order - b.order),
      }));
    return { summary, exercises, setCount: mine.filter((s) => s.done).length };
  }, [session, sessions, sessionExercises, sets, sessionCid, lookup]);

  const back = (
    <Button variant="ghost" icon={<IconChevronLeft />} onClick={() => goBack("/progress")} className="progress__back">
      All workouts
    </Button>
  );

  if (!session || !view) {
    return (
      <div className="stack">
        {back}
        <EmptyState icon={<IconHistory />} title="Workout not found">
          <p>It may have been deleted, or it hasn't synced to this device yet.</p>
        </EmptyState>
      </div>
    );
  }

  const { summary, exercises, setCount } = view;
  const finished = session.endedAt !== null;
  const editRow = editingSet ? sets.find((r) => r.cid === editingSet) : undefined;
  const editSet = editRow?.data ?? null;
  const editInfo = editSet ? lookup(editSet.exId) : null;

  const deleteSet = (cid: string, data: SetData) => {
    if (!store) return;
    const snap: Snapshot = [{ table: "sets", cid, data }];
    void removeRows(store, snap);
    setEditingSet(null);
    toast.show({ message: "Set deleted", action: { label: "Undo", onAction: () => void restoreRows(store, snap) } });
  };

  const confirmDelete = async () => {
    setSheet(null);
    goBack("/progress");
    await removeSession(sessionCid);
  };

  return (
    <article className="stack sessiondetail" aria-labelledby="session-title">
      {back}
      <header className="sessiondetail__head hist-head">
        <div>
          <h2 id="session-title" className="progress__title">
            {session.name || "Workout"}
          </h2>
          <p className="muted">
            {fmtDate(session.startedAt)} · {timeFmt.format(session.startedAt)}
            {!finished && " · in progress"}
          </p>
        </div>
        {finished && store && (
          <Button variant="secondary" onClick={() => setSheet("edit")}>
            Edit
          </Button>
        )}
      </header>

      <Card>
        <StatGrid className="sessiondetail__stats">
          <Stat label="Duration" value={fmtMinutes(summary.durationSec)} />
          <Stat label="Working sets" value={summary.setsDone} />
          <Stat label="Volume" value={fmtVolume(summary.volumeKg, unit)} />
        </StatGrid>
      </Card>

      {summary.prs.length > 0 && (
        <section aria-labelledby="session-prs" className="sessiondetail__prs">
          <SectionHeader level={3} id="session-prs" title={`Records set · ${summary.prs.length}`} />
          <Card as="div" padded={false} className="prlist__card">
            <ul className="prlist">
              {summary.prs.map((p, i) => (
                <li key={i}>
                  <span className="prlist__ex">{p.exName}</span>
                  <span className="prlist__what">{describePR(p.pr, unit)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {session.notes && <p className="sessiondetail__notes">{session.notes}</p>}

      {exercises.length === 0 ? (
        <p className="muted">No exercises were logged in this workout.</p>
      ) : (
        <section className="exhist__block" aria-labelledby="session-exercises">
          <SectionHeader level={3} id="session-exercises" title="Exercises" />
          <ol className="sessiondetail__list">
            {exercises.map((e) => (
              <li key={e.cid} className="sessiondetail__ex">
                <a className="sessiondetail__exname" href={href(pathFor("exercise", { exId: e.exId }))}>
                  <span>{lookup(e.exId).name}</span>
                  <IconChevronRight size={18} className="exhist__chev" />
                </a>
                {e.substitutedFrom && <p className="muted small">Swapped in for {lookup(e.substitutedFrom).name}</p>}
                {(() => {
                  // Matches the finish sheet: unticked sets stay in the plan, not in history.
                  const done = e.sets.filter((s) => s.done);
                  const open = e.sets.length - done.length;
                  return (
                    <>
                      {done.length === 0 ? (
                        <p className="muted small">No sets ticked.</p>
                      ) : (
                        <ol className="setlist">
                          {done.map((s) => (
                            <li key={s.cid} className={s.kind === "warmup" ? "setlist__row setlist__row--warm" : "setlist__row"}>
                              {finished && store ? (
                                <button type="button" className="hist-set" aria-label={`Edit ${KIND_LABEL[s.kind]} ${fmtSet(s, unit)}`} onClick={() => setEditingSet(s.cid)}>
                                  <span className="setlist__kind">{KIND_LABEL[s.kind]}</span>
                                  <span className="setlist__val num">{fmtSet(s, unit)}</span>
                                </button>
                              ) : (
                                <>
                                  <span className="setlist__kind">{KIND_LABEL[s.kind]}</span>
                                  <span className="setlist__val num">{fmtSet(s, unit)}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                      {open > 0 && done.length > 0 && (
                        <p className="muted small">
                          {open === 1
                            ? "1 planned set wasn't ticked and isn't counted."
                            : `${open} planned sets weren't ticked and aren't counted.`}
                        </p>
                      )}
                    </>
                  );
                })()}
                {e.notes && <p className="sessiondetail__notes small">{e.notes}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
      <MetricsHelp />

      {finished && store && (
        <>
          <Button variant="ghost" className="hist-delete" icon={<IconTrash size={20} />} onClick={() => setSheet("delete")}>
            Delete workout
          </Button>
          {sheet === "edit" && <SessionEditSheet open store={store} sessionCid={sessionCid} session={session} onClose={() => setSheet(null)} />}
          <DeleteSessionSheet
            open={sheet === "delete"}
            label={`${session.name || "Workout"} · ${fmtDate(session.startedAt)}`}
            exercises={exercises.length}
            sets={setCount}
            onClose={() => setSheet(null)}
            onConfirm={() => void confirmDelete()}
          />
        </>
      )}
      {store && editRow && editSet && editInfo && (
        <SetEditor
          key={editRow.cid}
          open
          set={editSet}
          info={editInfo}
          settings={settings}
          title={`${editInfo.name} · ${editSet.kind === "warmup" ? "warm-up" : "set"}`}
          onClose={() => setEditingSet(null)}
          onSave={(next) => {
            if (JSON.stringify(next) !== JSON.stringify(editSet)) void store.write("sets", editRow.cid, next);
          }}
          onLog={(next) => {
            setEditingSet(null);
            void store.write("sets", editRow.cid, next);
          }}
          onDelete={() => deleteSet(editRow.cid, editSet)}
        />
      )}
    </article>
  );
}
