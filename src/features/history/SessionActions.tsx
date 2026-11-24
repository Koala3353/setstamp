// Fixing a logged workout after the fact: edit its name, date and notes, or delete it (with Undo).
// All writes go to the local store first, so both work offline and sync later.
import { useId, useState } from "react";
import type { SessionData } from "../../shared/sync";
import type { SyncStore } from "../../sync";
import { Button, Sheet, TextField, useToast } from "../../ui";
import { deleteSession, moveToDate, restoreRows, updateSessionDetails } from "../workout/ops";
import "./history.css";

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date as YYYY-MM-DD, for <input type="date">. */
export const toYmd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Name, date and notes of a finished workout. Mounted per open (keyed by the caller). */
export function SessionEditSheet({
  open,
  store,
  sessionCid,
  session,
  onClose,
}: {
  open: boolean;
  store: SyncStore;
  sessionCid: string;
  session: SessionData;
  onClose: () => void;
}) {
  const notesId = useId();
  const [name, setName] = useState(session.name);
  const [date, setDate] = useState(toYmd(session.startedAt));
  const [notes, setNotes] = useState(session.notes);
  const toast = useToast();
  const today = toYmd(Date.now());
  const dateError = !/^\d{4}-\d{2}-\d{2}$/.test(date) ? "Pick a date." : date > today ? "Pick today or an earlier date." : null;

  const save = async () => {
    if (dateError) return;
    const startedAt = moveToDate(session.startedAt, date);
    await updateSessionDetails(store, sessionCid, {
      name: name.trim() || session.name || "Workout",
      notes: notes.trim(),
      ...(startedAt !== session.startedAt ? { startedAt } : {}),
    });
    onClose();
    toast.show({ message: "Workout updated" });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit workout"
      description="Records and stats are worked out again from the new date."
      footer={
        <div className="sheet-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" aria-disabled={!!dateError} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <form
        className="stack hist-edit"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} autoComplete="off" maxLength={80} />
        <TextField label="Date" type="date" value={date} max={today} onChange={(e) => setDate(e.currentTarget.value)} error={dateError} />
        <div className="ui-field">
          <label htmlFor={notesId} className="ui-field__label">
            Notes
          </label>
          <textarea id={notesId} className="ui-field__input hist-edit__notes" rows={3} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        </div>
      </form>
    </Sheet>
  );
}

/** Confirm sheet for deleting a whole workout; states exactly what goes. */
export function DeleteSessionSheet({
  open,
  label,
  exercises,
  sets,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** e.g. "Push · Fri 20 Nov" */
  label: string;
  exercises: number;
  sets: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Delete this workout?"
      description={
        <>
          {label}: the workout, its {plural(exercises, "exercise")} and {plural(sets, "set")} are removed on every device. Records and stats are
          worked out again without it.
        </>
      }
      footer={
        <div className="sheet-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete workout
          </Button>
        </div>
      }
    >
      <p className="small muted">You can undo for a few seconds afterwards.</p>
    </Sheet>
  );
}

/** Delete a workout and offer Undo (re-upserts the rows, which win over the tombstones). */
export function useDeleteSession(store: SyncStore | null): (sessionCid: string) => Promise<void> {
  const toast = useToast();
  return async (sessionCid: string) => {
    if (!store) return;
    const snap = await deleteSession(store, sessionCid);
    toast.show({ message: "Workout deleted", duration: 6000, action: { label: "Undo", onAction: () => void restoreRows(store, snap) } });
  };
}
