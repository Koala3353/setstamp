// Create / edit a custom exercise (customExercises row, exId "cx_" + cid).
// Before creating, near-matches in the catalog are offered ("Did you mean …?").
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { BodyMap, BodyMapLegend, involvementLevels } from "../../bodymap";
import {
  EQUIPMENT,
  EQUIPMENT_LABEL,
  MUSCLE_INFO,
  MUSCLES,
  PATTERNS,
  TRACKING,
  type Equipment,
  type Muscle,
  type Pattern,
  type Tracking,
} from "../../shared/domain";
import type { CustomExerciseData } from "../../shared/sync";
import { useRow, useRows, useSyncStore } from "../../sync/react";
import { goBack } from "../../app/router";
import { deleteCustomExercise, restoreRows } from "../workout/ops";
import "../history/history.css";
import { Button, ChipRow, FilterChip, Segmented, Sheet, Switch, TextField, useToast } from "../../ui";
import { PATTERN_LABEL, TRACKING_HINT, TRACKING_LABEL } from "./labels";
import { customExId } from "./model";
import { useExerciseSearch } from "./useExerciseSearch";

export type CustomExerciseSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Edit this existing custom exercise row; omit to create. */
  editCid?: string | null;
  initialName?: string;
  onSaved?: (exId: string) => void;
  /** User chose an existing exercise from the duplicate suggestions. */
  onUseExisting?: (exId: string) => void;
  /** After a delete (edit mode). Default: close and go back, since the exercise's page is gone. */
  onDeleted?: () => void;
};

type Draft = {
  name: string;
  equipment: Equipment[];
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern | null;
  tracking: Tracking;
  unilateral: boolean;
  aliases: string[];
  notes: string;
};

const blank = (name = ""): Draft => ({
  name,
  equipment: [],
  primary: [],
  secondary: [],
  pattern: null,
  tracking: "weight_reps",
  unilateral: false,
  aliases: [],
  notes: "",
});

const toggleIn = <T,>(list: T[], v: T, on: boolean) => (on ? (list.includes(v) ? list : [...list, v]) : list.filter((x) => x !== v));

export function CustomExerciseSheet({ open, onClose, editCid, initialName, onSaved, onUseExisting, onDeleted }: CustomExerciseSheetProps) {
  const store = useSyncStore();
  const toast = useToast();
  const existing = useRow("customExercises", editCid ?? null);
  const xs = useExerciseSearch();
  const nameId = useId();
  const [draft, setDraft] = useState<Draft>(blank());
  const [mapTarget, setMapTarget] = useState<"primary" | "secondary">("primary");
  const [confirmDup, setConfirmDup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset when (re)opened.
  useEffect(() => {
    if (!open) return;
    const d = existing?.data;
    setDraft(d ? { ...d, pattern: d.pattern } : blank(initialName ?? ""));
    setConfirmDup(false);
    setConfirmDelete(false);
    setError(null);
  }, [open]);

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };

  const ownExId = editCid ? customExId(editCid) : null;
  const duplicates = useMemo(() => {
    const name = draft.name.trim();
    if (name.length < 3) return [];
    return xs
      .run(name, { limit: 5 })
      .results.filter((r) => r.exercise.exId !== ownExId && ["exact", "alias", "prefix", "fuzzy", "token"].includes(r.matchKind))
      .slice(0, 3);
  }, [xs, draft.name, ownExId]);
  const exactDup = duplicates.find((r) => r.matchKind === "exact" || r.matchKind === "alias");

  const levels = useMemo(() => involvementLevels([draft]), [draft]);
  const onMapSelect = (m: Muscle | null) => {
    if (!m) return;
    if (mapTarget === "primary") {
      const on = !draft.primary.includes(m);
      set({
        primary: toggleIn(draft.primary, m, on),
        secondary: draft.secondary.filter((x) => x !== m),
      });
    } else {
      const on = !draft.secondary.includes(m);
      set({
        secondary: toggleIn(draft.secondary, m, on),
        primary: draft.primary.filter((x) => x !== m),
      });
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = draft.name.trim();
    if (!name) return setError("Give it a name.");
    if (draft.primary.length === 0) return setError("Pick at least one primary muscle.");
    if (!draft.pattern) return setError("Pick a movement pattern.");
    if (!editCid && exactDup && !confirmDup) {
      setConfirmDup(true);
      return setError(`“${exactDup.exercise.name}” already exists. Use it, or create yours anyway.`);
    }
    if (!store) return setError("Sign in to save custom exercises.");
    const cid = editCid ?? crypto.randomUUID();
    const data: CustomExerciseData = {
      exId: customExId(cid),
      name,
      aliases: draft.aliases,
      equipment: draft.equipment.length ? draft.equipment : ["bodyweight"],
      primary: draft.primary,
      secondary: draft.secondary.filter((m) => !draft.primary.includes(m)),
      pattern: draft.pattern,
      tracking: draft.tracking,
      unilateral: draft.unilateral,
      notes: draft.notes,
    };
    setSaving(true);
    try {
      await store.write("customExercises", cid, data);
      toast.show({ message: editCid ? "Exercise updated" : `${name} created` });
      onSaved?.(data.exId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save on this device.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editCid ? "Edit exercise" : "New custom exercise"}
      className="excustom"
      footer={
        <Button variant="primary" size="lg" block loading={saving} onClick={() => void submit()}>
          {confirmDup ? "Create anyway" : editCid ? "Save changes" : "Create exercise"}
        </Button>
      }
    >
      <form className="exform" onSubmit={submit} noValidate>
        <TextField
          id={nameId}
          label="Name"
          value={draft.name}
          autoComplete="off"
          onChange={(e) => {
            set({ name: e.currentTarget.value });
            setConfirmDup(false);
          }}
          placeholder="e.g. Landmine press"
        />

        {!editCid && duplicates.length > 0 && (
          <div className="exform__dups" role="status">
            <p className="exform__hint">Did you mean</p>
            <div className="exbrowser__suggest">
              {duplicates.map((r) => (
                <button key={r.exercise.exId} type="button" className="ui-fchip" onClick={() => onUseExisting?.(r.exercise.exId)}>
                  <span>{r.exercise.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="exform__field">
          <legend className="exform__label">Equipment</legend>
          <ChipRow label="Equipment">
            {EQUIPMENT.map((e) => (
              <FilterChip
                key={e}
                selected={draft.equipment.includes(e)}
                onChange={(on) => set({ equipment: toggleIn(draft.equipment, e, on) })}
              >
                {EQUIPMENT_LABEL[e]}
              </FilterChip>
            ))}
          </ChipRow>
        </fieldset>

        <fieldset className="exform__field">
          <legend className="exform__label">Muscles</legend>
          <Segmented
            label="Tapping the map sets"
            value={mapTarget}
            onChange={setMapTarget}
            options={[
              { value: "primary", label: "Primary" },
              { value: "secondary", label: "Secondary" },
            ]}
          />
          <BodyMap levels={levels} onSelect={onMapSelect} className="exform__map" />
          <BodyMapLegend />
          <p className="exform__sublabel">Primary</p>
          <ChipRow label="Primary muscles">
            {MUSCLES.map((m) => (
              <FilterChip
                key={m}
                selected={draft.primary.includes(m)}
                onChange={(on) =>
                  set({
                    primary: toggleIn(draft.primary, m, on),
                    secondary: draft.secondary.filter((x) => x !== m),
                  })
                }
              >
                {MUSCLE_INFO[m].label}
              </FilterChip>
            ))}
          </ChipRow>
          <p className="exform__sublabel">Secondary</p>
          <ChipRow label="Secondary muscles">
            {MUSCLES.filter((m) => !draft.primary.includes(m)).map((m) => (
              <FilterChip
                key={m}
                selected={draft.secondary.includes(m)}
                onChange={(on) => set({ secondary: toggleIn(draft.secondary, m, on) })}
              >
                {MUSCLE_INFO[m].label}
              </FilterChip>
            ))}
          </ChipRow>
        </fieldset>

        <fieldset className="exform__field">
          <legend className="exform__label">Movement</legend>
          <ChipRow label="Movement pattern">
            {PATTERNS.map((p) => (
              <FilterChip key={p} selected={draft.pattern === p} onChange={() => set({ pattern: p })}>
                {PATTERN_LABEL[p]}
              </FilterChip>
            ))}
          </ChipRow>
        </fieldset>

        <fieldset className="exform__field">
          <legend className="exform__label">Tracking</legend>
          <ChipRow label="Tracking type">
            {TRACKING.map((t) => (
              <FilterChip key={t} selected={draft.tracking === t} onChange={() => set({ tracking: t })}>
                {TRACKING_LABEL[t]}
              </FilterChip>
            ))}
          </ChipRow>
          <p className="small muted">{TRACKING_HINT[draft.tracking]}</p>
        </fieldset>

        <Switch
          checked={draft.unilateral}
          onChange={(v) => set({ unilateral: v })}
          label="One side at a time"
          description="Unilateral: log each side"
        />

        {error && (
          <p className="exform__error" role="alert">
            {error}
          </p>
        )}
      </form>
      {editCid && existing?.data && (
        <DeleteCustom
          exId={existing.data.exId}
          name={existing.data.name}
          confirming={confirmDelete}
          onAsk={setConfirmDelete}
          onDelete={async () => {
            if (!store) return;
            const snap = await deleteCustomExercise(store, editCid);
            toast.show({ message: `Deleted ${existing.data!.name}`, duration: 6000, action: { label: "Undo", onAction: () => void restoreRows(store, snap) } });
            onClose();
            if (onDeleted) onDeleted();
            else goBack("/exercises");
          }}
        />
      )}
    </Sheet>
  );
}

/** Delete a custom exercise, after saying plainly what stays. */
function DeleteCustom({
  exId,
  name,
  confirming,
  onAsk,
  onDelete,
}: {
  exId: string;
  name: string;
  confirming: boolean;
  onAsk: (on: boolean) => void;
  onDelete: () => Promise<void>;
}) {
  const sets = useRows("sets");
  const programs = useRows("programs");
  const logged = sets.filter((r) => r.data?.exId === exId && r.data.done).length;
  const slots = programs.reduce((n, p) => n + (p.data?.days.reduce((m, d) => m + d.slots.filter((s) => s.exId === exId).length, 0) ?? 0), 0);
  if (!confirming) {
    return (
      <Button variant="ghost" className="excustom__delete" onClick={() => onAsk(true)}>
        Delete exercise
      </Button>
    );
  }
  return (
    <div className="excustom__confirm" role="group" aria-label={`Delete ${name}?`}>
      <p className="excustom__confirm-title">Delete {name}?</p>
      <p className="small muted">
        {logged > 0 ? `Your ${logged} logged ${logged === 1 ? "set stays" : "sets stay"} in history, shown as "Deleted exercise". ` : "Nothing is logged with it yet. "}
        {slots > 0 ? `It's in ${slots} program ${slots === 1 ? "slot" : "slots"}; swap ${slots === 1 ? "it" : "them"} for another exercise.` : ""}
      </p>
      <div className="sheet-actions">
        <Button variant="ghost" onClick={() => onAsk(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void onDelete()}>
          Delete
        </Button>
      </div>
    </div>
  );
}
