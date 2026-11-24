// Edit one program day: name, slots (add via picker, reorder, edit, swap, remove) and a live
// body map that updates as exercises are added.
import { useMemo, useState } from "react";
import { IconArrow } from "./ArrowIcon";
import type { Muscle } from "../../shared/domain";
import type { PlannedSlot, ProgramData, ProgramDay, SettingsData } from "../../shared/sync";
import { newCid } from "../../sync";
import { Button, Card, IconButton, IconChevronLeft, IconPlus, ListGroup, ListRow, Stat, StatGrid, TextField } from "../../ui";
import { Section } from "../../app/Shell";
import { goBack } from "../../app/router";
import { ExercisePicker } from "../exercises/ExercisePicker";
import { CoveragePanel } from "../coverage/CoveragePanel";
import { describeSlot, estimateDayMinutes, type ExerciseIndexLike } from "./format";
import { SlotSheet } from "./SlotSheet";
import { newSlot } from "./templates";
import { replaceDays } from "./schedule";

type PickerState = { kind: "add" } | { kind: "swap"; slotId: string } | { kind: "alternate"; slotId: string } | null;

export function DayEditor({
  programCid,
  program,
  day,
  index,
  settings,
  exercises,
  write,
}: {
  programCid: string;
  program: ProgramData;
  day: ProgramDay;
  index: number;
  settings: SettingsData;
  exercises: ExerciseIndexLike;
  write: (cid: string, data: ProgramData) => Promise<void>;
}) {
  const { list, lookup } = exercises;
  const [editing, setEditing] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const [name, setName] = useState(day.name);

  const saveDay = (next: ProgramDay) => write(programCid, replaceDays(program, program.days.map((d) => (d.dayId === next.dayId ? next : d))));
  const saveSlots = (slots: PlannedSlot[]) => saveDay({ ...day, slots });

  const addExercises = (ids: string[]) => {
    const add = ids
      .map((id) => lookup(id))
      .filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => newSlot(e, newCid()));
    if (add.length) void saveSlots([...day.slots, ...add]);
  };
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= day.slots.length) return;
    const slots = [...day.slots];
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
    void saveSlots(slots);
  };

  const minutes = estimateDayMinutes(day, settings.defaultRestSec);
  const over = settings.sessionMinutes != null && settings.sessionMinutes > 0 && minutes > settings.sessionMinutes;
  const sessionMuscles = useMemo(() => {
    const out = new Set<Muscle>();
    for (const s of day.slots) for (const m of lookup(s.exId)?.primary ?? []) out.add(m);
    return [...out];
  }, [day.slots, lookup]);
  const editingSlot = day.slots.find((s) => s.slotId === editing) ?? null;
  const swapFor = picker && picker.kind !== "add" ? day.slots.find((s) => s.slotId === picker.slotId)?.exId : undefined;

  return (
    <div className="screen">
      <div className="prog-back">
        <Button variant="ghost" icon={<IconChevronLeft size={20} />} onClick={() => goBack("/program")}>
          {program.name}
        </Button>
      </div>

      <TextField
        label={`Day ${index + 1} of ${program.days.length}`}
        className="prog-name"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const n = name.trim() || `Day ${index + 1}`;
          setName(n);
          if (n !== day.name) void saveDay({ ...day, name: n });
        }}
      />

      <div className="prog-estimate">
        <StatGrid>
          <Stat label="Working sets" value={day.slots.reduce((a, s) => a + s.sets, 0)} />
          <Stat
            label={settings.sessionMinutes ? `Your target is ${settings.sessionMinutes} min` : "Session length"}
            value={`~${minutes}`}
            unit="min"
            note="estimated"
          />
        </StatGrid>
        <p className="small muted">
          Estimated as sets × (rest + ~40&nbsp;s), warm-ups not included.
          {over && " A little over your target; trimming sets or rest on accessories would shorten it, if that matters today."}
        </p>
      </div>

      <Section title="Exercises" id="day-exercises">
        {day.slots.length === 0 ? (
          <p className="small muted">No exercises yet. Add some, then watch the body map below fill in.</p>
        ) : (
          <ListGroup label="Planned exercises" className="prog-list">
            {day.slots.map((s, i) => {
              const name = lookup(s.exId)?.name ?? s.exId;
              return (
                <li key={s.slotId} className="prog-slot">
                  <ListRow
                    leading={<span className="prog-station num">{i + 1}</span>}
                    title={name}
                    meta={describeSlot(s, settings.defaultRestSec)}
                    onClick={() => setEditing(s.slotId)}
                  />
                  <span className="prog-slot__order">
                    <IconButton label={`Move ${name} up`} icon={<IconArrow dir="up" />} disabled={i === 0} onClick={() => move(i, -1)} />
                    <IconButton label={`Move ${name} down`} icon={<IconArrow dir="down" />} disabled={i === day.slots.length - 1} onClick={() => move(i, 1)} />
                  </span>
                </li>
              );
            })}
          </ListGroup>
        )}
        <Button variant="secondary" block icon={<IconPlus size={20} />} onClick={() => setPicker({ kind: "add" })}>
          Add exercises
        </Button>
      </Section>

      <Section title="Muscle coverage" id="day-coverage" meta="Updates as you add exercises. Tap a muscle to add or swap.">
        <Card>
        <CoveragePanel
          days={program.days}
          day={day}
          list={list}
          lookup={lookup}
          available={settings.availableEquipment}
          onAdd={(exId) => addExercises([exId])}
          onSwap={(slotId) => setPicker({ kind: "swap", slotId })}
        />
        </Card>
      </Section>

      <SlotSheet
        slot={editingSlot}
        lookup={lookup}
        defaultRestSec={settings.defaultRestSec}
        onClose={() => setEditing(null)}
        onChange={(next) => void saveSlots(day.slots.map((s) => (s.slotId === next.slotId ? next : s)))}
        onRemove={(slotId) => {
          setEditing(null);
          void saveSlots(day.slots.filter((s) => s.slotId !== slotId));
        }}
        onSwap={(slotId) => {
          setEditing(null);
          setPicker({ kind: "swap", slotId });
        }}
        onAddAlternate={(slotId) => setPicker({ kind: "alternate", slotId })}
      />

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        title={picker?.kind === "add" ? `Add to ${day.name}` : picker?.kind === "alternate" ? "Add an alternate" : "Swap exercise"}
        multi={picker?.kind === "add"}
        mode={picker?.kind === "add" ? "add" : "substitute"}
        substituteFor={swapFor}
        sessionMuscles={sessionMuscles}
        onPickMany={(ids: string[]) => {
          addExercises(ids);
          setPicker(null);
        }}
        onPick={(exId: string) => {
          const p = picker;
          setPicker(null);
          if (!p) return;
          if (p.kind === "add") return addExercises([exId]);
          void saveSlots(
            day.slots.map((s) => {
              if (s.slotId !== p.slotId) return s;
              if (p.kind === "alternate") return s.alternates.includes(exId) || exId === s.exId ? s : { ...s, alternates: [...s.alternates, exId] };
              // Swap keeps sets/reps/rest; the old exercise becomes an alternate so nothing is lost.
              const alternates = [s.exId, ...s.alternates.filter((a) => a !== exId && a !== s.exId)];
              return { ...s, exId, alternates };
            }),
          );
        }}
      />
    </div>
  );
}
