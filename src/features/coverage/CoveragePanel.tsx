// Interactive front/back coverage linked to the program.
// Views: "This day" (involvement: primary solid, secondary hatched), "Week plan" and
// "Completed, last 7 days" (estimated sets, volume mode). Planned and completed are never mixed.
import { useMemo, useState } from "react";
import { MUSCLE_INFO, type Equipment, type Muscle } from "../../shared/domain";
import type { ProgramDay } from "../../shared/sync";
import { BodyMap, BodyMapLegend, MuscleChips, type MuscleLevels } from "../../bodymap";
import { Button, ListGroup, ListRow, Segmented, Sheet } from "../../ui";
import { useRows } from "../../sync/react";
import {
  completedCoverage,
  dayCoverage,
  ESTIMATE_NOTE,
  exercisesForMuscle,
  isCompletedWorkingSet,
  suggestForMuscle,
  WEEK_DAYS_MS,
  weekCoverage,
  type ExerciseInfo,
  type ExerciseLookup,
} from "./coverage";
import "./coverage.css";

export type CoverageView = "day" | "week" | "done";

type Props = {
  days: readonly ProgramDay[];
  /** The day being edited; enables the "This day" view, add suggestions and swaps. */
  day?: ProgramDay;
  list: readonly ExerciseInfo[];
  lookup: ExerciseLookup;
  available: readonly Equipment[];
  onAdd?: (exId: string) => void;
  onSwap?: (slotId: string) => void;
  initialView?: CoverageView;
};

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export function CoveragePanel({ days, day, list, lookup, available, onAdd, onSwap, initialView }: Props) {
  const [view, setView] = useState<CoverageView>(initialView ?? (day ? "day" : "week"));
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const sets = useRows("sets");
  const [now] = useState(() => Date.now());

  const dayLevels = useMemo(() => (day ? dayCoverage(day, lookup) : {}), [day, lookup]);
  const weekLevels = useMemo(() => weekCoverage({ days: [...days] }, lookup), [days, lookup]);
  const doneSets = useMemo(
    () => sets.map((r) => r.data).filter((d): d is NonNullable<typeof d> => !!d && d.completedAt != null && d.completedAt >= now - WEEK_DAYS_MS),
    [sets, now],
  );
  const doneLevels = useMemo(() => completedCoverage(doneSets, lookup, now), [doneSets, lookup, now]);

  const levels: MuscleLevels = view === "day" ? dayLevels : view === "week" ? weekLevels : doneLevels;
  const mode = view === "day" ? "involvement" : "volume";

  const options = [
    ...(day ? [{ value: "day" as const, label: "This day" }] : []),
    { value: "week" as const, label: "Week plan" },
    { value: "done" as const, label: "Logged" },
  ];

  const empty = Object.keys(levels).length === 0;

  return (
    <div className="cov">
      <Segmented label="Coverage view" options={options} value={view} onChange={(v) => setView(v)} />
      <p className="cov__caption small muted">
        {view === "day" && "Muscles this day's exercises list as primary or secondary. Tap a muscle for details."}
        {view === "week" &&
          `Planned sets per muscle if each of the ${days.length} program ${days.length === 1 ? "day is" : "days are"} trained once a week. Your rotation may run faster or slower.`}
        {view === "done" && "Working sets you logged in the last 7 days (warm-ups excluded). Separate from the plan."}
      </p>
      <BodyMap levels={levels} mode={mode} selected={muscle} onSelect={setMuscle} />
      <BodyMapLegend mode={mode} />
      {empty ? (
        <p className="cov__empty small muted">
          {view === "done" ? "No completed working sets in the last 7 days." : "Add exercises to see coverage."}
        </p>
      ) : (
        <MuscleChips levels={levels} mode={mode} selected={muscle} onSelect={setMuscle} />
      )}
      <div className="cov__fine">
        {mode === "volume" && <p>{ESTIMATE_NOTE}</p>}
        <p>Coverage shows what exercises are listed to train. It isn't a diagnosis, a recovery measure, or proof a program is optimal.</p>
      </div>

      <MuscleSheet
        muscle={muscle}
        onClose={() => setMuscle(null)}
        view={view}
        days={days}
        day={day}
        list={list}
        lookup={lookup}
        available={available}
        levels={levels}
        doneSets={doneSets}
        onAdd={onAdd}
        onSwap={onSwap}
      />
    </div>
  );
}

function MuscleSheet({
  muscle,
  onClose,
  view,
  days,
  day,
  list,
  lookup,
  available,
  levels,
  doneSets,
  onAdd,
  onSwap,
}: {
  muscle: Muscle | null;
  onClose: () => void;
  view: CoverageView;
  days: readonly ProgramDay[];
  day?: ProgramDay;
  list: readonly ExerciseInfo[];
  lookup: ExerciseLookup;
  available: readonly Equipment[];
  levels: MuscleLevels;
  doneSets: readonly { exId: string; kind: "warmup" | "working" | "drop" | "failure"; done: boolean }[];
  onAdd?: (exId: string) => void;
  onSwap?: (slotId: string) => void;
}) {
  const label = muscle ? MUSCLE_INFO[muscle].label : "";
  const scope = view === "day" && day ? [day] : days;
  const uses = useMemo(() => (muscle ? exercisesForMuscle(muscle, scope, lookup) : []), [muscle, scope, lookup]);
  const suggestions = useMemo(
    () => (muscle && day && onAdd ? suggestForMuscle(muscle, list, { available, daySlots: day.slots, lookup, limit: 5 }) : []),
    [muscle, day, onAdd, list, available, lookup],
  );
  const logged = useMemo(() => {
    if (!muscle || view !== "done") return [];
    const per = new Map<string, number>();
    for (const s of doneSets) if (isCompletedWorkingSet(s)) per.set(s.exId, (per.get(s.exId) ?? 0) + 1);
    const out: Array<{ ex: ExerciseInfo; sets: number; role: "primary" | "secondary" }> = [];
    for (const [exId, n] of per) {
      const ex = lookup(exId);
      if (!ex) continue;
      if (ex.primary.includes(muscle)) out.push({ ex, sets: n, role: "primary" });
      else if (ex.secondary.includes(muscle)) out.push({ ex, sets: n, role: "secondary" });
    }
    return out.sort((a, b) => (a.role === b.role ? b.sets - a.sets : a.role === "primary" ? -1 : 1));
  }, [muscle, view, doneSets, lookup]);

  const value = muscle ? levels[muscle] : undefined;
  const description =
    view === "day"
      ? "In this day"
      : view === "week"
        ? `About ${fmt(value ?? 0)} planned sets a week (estimate)`
        : `About ${fmt(value ?? 0)} completed sets in the last 7 days (estimate)`;

  return (
    <Sheet open={muscle !== null} onClose={onClose} title={label} description={description}>
      {view !== "done" && (
        <section className="cov-sheet__group">
          <h3 className="cov-sheet__title">Planned exercises</h3>
          {uses.length === 0 ? (
            <p className="small muted">Nothing planned{view === "day" ? " in this day" : ""} lists {label.toLowerCase()}.</p>
          ) : (
            <ListGroup label={`Planned exercises for ${label}`}>
              {uses.map((u) => (
                <li key={u.slot.slotId}>
                  <ListRow
                    title={u.exercise.name}
                    meta={`${u.role === "primary" ? "Primary" : "Secondary"} · ${u.slot.sets} ${u.slot.sets === 1 ? "set" : "sets"}${view === "week" && u.dayName ? ` · ${u.dayName}` : ""}`}
                    trailing={
                      onSwap && day?.slots.some((s) => s.slotId === u.slot.slotId) ? (
                        <Button variant="ghost" onClick={() => onSwap(u.slot.slotId)}>
                          Swap
                        </Button>
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ListGroup>
          )}
        </section>
      )}

      {view === "done" && (
        <section className="cov-sheet__group">
          <h3 className="cov-sheet__title">Logged in the last 7 days</h3>
          {logged.length === 0 ? (
            <p className="small muted">No completed working sets for {label.toLowerCase()}.</p>
          ) : (
            <ListGroup label={`Logged exercises for ${label}`}>
              {logged.map((l) => (
                <li key={l.ex.exId}>
                  <ListRow title={l.ex.name} meta={`${l.role === "primary" ? "Primary" : "Secondary"} · ${l.sets} working ${l.sets === 1 ? "set" : "sets"}`} />
                </li>
              ))}
            </ListGroup>
          )}
        </section>
      )}

      {suggestions.length > 0 && (
        <section className="cov-sheet__group">
          <h3 className="cov-sheet__title">Add an exercise for {label.toLowerCase()}</h3>
          <p className="small muted">
            Exercises where {label.toLowerCase()} is a primary muscle{available.length ? ", using equipment you have" : ""}. Common ones and
            movement patterns this day doesn't have yet come first. Optional: overlap with what's planned is normal.
          </p>
          <ListGroup label={`Suggestions for ${label}`}>
            {suggestions.map((s) => (
              <li key={s.exercise.exId}>
                <ListRow
                  title={s.exercise.name}
                  meta={s.reasons.slice(1).join(" · ") || "Primary mover"}
                  trailing={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onAdd?.(s.exercise.exId);
                        onClose();
                      }}
                    >
                      Add
                    </Button>
                  }
                />
              </li>
            ))}
          </ListGroup>
        </section>
      )}
    </Sheet>
  );
}
