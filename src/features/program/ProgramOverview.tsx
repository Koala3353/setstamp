// Active program: rolling "next up" queue with Start / Skip / Pick a day, the day list,
// planned-week coverage and balance notes, and a planned-vs-completed timeline.
import { useMemo, useState } from "react";
import { IconArrow } from "./ArrowIcon";
import type { ProgramData, ProgramDay, SettingsData } from "../../shared/sync";
import { newCid } from "../../sync";
import { useRows, useSyncStore } from "../../sync/react";
import { Button, Card, Chip, IconButton, IconPlay, IconPlus, IconTrash, ListGroup, ListRow, Sheet, SortHandle, useSortable, useToast } from "../../ui";
import { Section } from "../../app/Shell";
import { navigate } from "../../app/router";
import { useOpenSession } from "../workout/useWorkout";
import { balanceNotes, estimateDayMinutes } from "../coverage/coverage";
import { CoveragePanel } from "../coverage/CoveragePanel";
import { startProgramDay } from "../workout/ops";
import { useExerciseLookup } from "../workout/exerciseInfo";
import type { ExerciseIndexLike } from "./format";
import { ActiveProgramActions } from "./ProgramManage";
import { moveToDay, nextDay, replaceDays, skipDay, timeline } from "./schedule";

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

export function ProgramOverview({
  programCid,
  program,
  settings,
  exercises,
  write,
  onNewProgram,
}: {
  programCid: string;
  program: ProgramData;
  settings: SettingsData;
  exercises: ExerciseIndexLike;
  write: (cid: string, data: ProgramData) => Promise<void>;
  onNewProgram: () => void;
}) {
  const store = useSyncStore();
  const toast = useToast();
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const workoutLookup = useExerciseLookup();
  const [chooseDay, setChooseDay] = useState(false);
  const [starting, setStarting] = useState(false);
  // One workout at a time: while one is open, the dock's Resume is the action, not a second Start.
  const openSession = useOpenSession();
  const { list, lookup } = exercises;

  const up = nextDay(program);
  const notes = useMemo(
    () => balanceNotes(program, lookup, { defaultRestSec: settings.defaultRestSec, sessionMinutes: settings.sessionMinutes }),
    [program, lookup, settings.defaultRestSec, settings.sessionMinutes],
  );
  const recent = useMemo(() => timeline(program, 8), [program]);
  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.cid, s.data])), [sessions]);
  const doneSetsBySession = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of sets) if (r.data && r.data.done && r.data.kind !== "warmup") m.set(r.data.sessionCid, (m.get(r.data.sessionCid) ?? 0) + 1);
    return m;
  }, [sets]);
  const plannedSets = (dayId: string) => program.days.find((d) => d.dayId === dayId)?.slots.reduce((a, s) => a + s.sets, 0);

  const start = async (day: ProgramDay) => {
    if (!store || starting) return;
    setStarting(true);
    try {
      await startProgramDay(
        store,
        programCid,
        program,
        day,
        { sessions: sessions.map((s) => ({ cid: s.cid, data: s.data })), sets: sets.map((s) => ({ cid: s.cid, data: s.data })) },
        settings,
        workoutLookup,
      );
      navigate("/workout");
    } finally {
      setStarting(false);
    }
  };

  const skip = () => {
    if (!up) return;
    const before = program;
    void write(programCid, skipDay(program, Date.now()));
    toast.show({
      message: `Skipped ${up.day.name}. The plan is unchanged.`,
      action: { label: "Undo", onAction: () => void write(programCid, before) },
    });
  };

  const setDays = (days: ProgramDay[]) => write(programCid, replaceDays(program, days));
  const addDay = () => setDays([...program.days, { dayId: newCid(), name: `Day ${program.days.length + 1}`, slots: [] }]);
  const moveDay = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= program.days.length) return;
    const days = [...program.days];
    [days[i], days[j]] = [days[j]!, days[i]!];
    void setDays(days);
  };
  // Drag a day to reorder; the same day stays up next (replaceDays).
  const sort = useSortable({
    keys: program.days.map((d) => d.dayId),
    name: (dayId) => program.days.find((d) => d.dayId === dayId)?.name ?? "Day",
    onCommit: (order) => {
      const byId = new Map(program.days.map((d) => [d.dayId, d]));
      void setDays(order.map((id) => byId.get(id)!));
    },
  });
  const removeDay = (d: ProgramDay) => {
    const before = program;
    void setDays(program.days.filter((x) => x.dayId !== d.dayId));
    toast.show({ message: `Removed ${d.name}. Its history stays.`, action: { label: "Undo", onAction: () => void write(programCid, before) } });
  };

  // The rolling queue from the next day on: what comes after today's pick, in order.
  const queue = up ? program.days.map((_, k) => program.days[(up.index + k) % program.days.length]!).slice(1, 4) : [];

  return (
    <div className="screen">
      <p className="screen-kicker">
        {program.name} · {program.days.length} {program.days.length === 1 ? "day" : "days"}, run in order
      </p>

      <Section title="Next up" id="prog-next">
        {up ? (
          <Card className="prog-next">
            <div className="prog-next__head">
              <span className="prog-next__station num" aria-hidden="true">
                {up.index + 1}
              </span>
              <div>
                <p className="prog-next__title">{up.day.name}</p>
                <p className="prog-next__meta">
                  Day {up.index + 1} of {program.days.length} · {up.day.slots.length}&nbsp;exercises · about{" "}
                  {estimateDayMinutes(up.day, settings.defaultRestSec)}&nbsp;min
                </p>
              </div>
            </div>
            {openSession ? (
              <p className="prog-next__busy">
                {openSession.data.name} is in progress. Finish it to start the next day; Resume is at the bottom of the screen.
              </p>
            ) : (
              <Button variant="primary" size="lg" block icon={<IconPlay size={20} />} loading={starting} disabled={up.day.slots.length === 0} onClick={() => void start(up.day)}>
                Start {up.day.name}
              </Button>
            )}
            <div className="prog-next__row">
              <Button variant="secondary" onClick={skip}>
                Skip this day
              </Button>
              <Button variant="secondary" onClick={() => setChooseDay(true)}>
                Pick a day
              </Button>
            </div>
            {queue.length > 0 && (
              <p className="prog-next__then">
                Then: {queue.map((d) => d.name).join(" → ")}
              </p>
            )}
          </Card>
        ) : (
          <p className="small muted">This program has no days yet.</p>
        )}
        <p className="small muted">Skipping or picking a day changes the order you train in, never the plan. Both are logged below and can be undone.</p>
      </Section>

      <Section
        title="Days"
        id="prog-days"
        aside={
          <Button variant="ghost" icon={<IconPlus size={20} />} onClick={() => void addDay()}>
            Add day
          </Button>
        }
      >
        <ListGroup label="Program days" className={sort.listClass("prog-list")}>
          {program.days.map((d, i) => (
            <li key={d.dayId} {...sort.item(d.dayId, "prog-slot")}>
              {program.days.length > 1 && <SortHandle bind={sort.handle(d.dayId)} />}
              <ListRow
                leading={<span className={`prog-station num${up?.day.dayId === d.dayId ? " is-next" : ""}`}>{i + 1}</span>}
                title={d.name}
                meta={`${d.slots.length}\u00a0exercises · ${d.slots.reduce((a, s) => a + s.sets, 0)}\u00a0sets · ~${estimateDayMinutes(d, settings.defaultRestSec)}\u00a0min${up?.day.dayId === d.dayId ? " · up\u00a0next" : ""}`}
                chevron
                onClick={() => navigate(`/program?day=${encodeURIComponent(d.dayId)}`)}
              />
              <span className="prog-slot__order">
                <IconButton label={`Move ${d.name} earlier`} icon={<IconArrow dir="up" />} disabled={i === 0} onClick={() => moveDay(i, -1)} />
                <IconButton label={`Remove ${d.name}`} icon={<IconTrash size={20} />} disabled={program.days.length <= 1} onClick={() => removeDay(d)} />
              </span>
            </li>
          ))}
        </ListGroup>
        {sort.live}
      </Section>

      <Section title="Muscle coverage" id="prog-coverage" meta="What the planned week works, and what you actually logged.">
        <Card>
          <CoveragePanel days={program.days} list={list} lookup={lookup} available={settings.availableEquipment} />
        </Card>
      </Section>

      {notes.length > 0 && (
        <Section title="Balance notes" id="prog-balance" meta="Automatic notes about the planned week, for information only.">
          <ul className="prog-notes">
            {notes.map((n) => (
              <li key={n.id} className={`prog-note prog-note--${n.kind}`}>
                {n.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Planned vs completed" id="prog-history">
        {recent.length === 0 ? (
          <p className="small muted">Finished, skipped and moved days show here. Nothing yet.</p>
        ) : (
          <ListGroup label="Recent schedule">
            {recent.map((t, i) => {
              const ses = t.sessionCid ? sessionById.get(t.sessionCid) : null;
              const done = t.sessionCid ? doneSetsBySession.get(t.sessionCid) ?? 0 : 0;
              const planned = plannedSets(t.dayId);
              // A completed day whose workout was later deleted: the log entry stays, the link goes.
              const gone = t.action === "completed" && !!t.sessionCid && !ses;
              const meta =
                gone
                  ? "Completed · workout since deleted"
                  : t.action === "completed"
                  ? `Completed ${done} of ${planned ?? "?"} planned working sets${ses ? ` · ${ses.name}` : ""}`
                  : t.action === "skipped"
                    ? "Skipped · plan unchanged"
                    : "Moved to the front of the queue";
              return (
                <li key={`${t.at}-${i}`}>
                  <ListRow
                    title={`${dateFmt.format(new Date(t.at))} · ${t.dayName}`}
                    meta={meta}
                    trailing={<Chip tone={t.action === "completed" ? "ok" : "neutral"}>{t.action === "completed" ? "Done" : t.action === "skipped" ? "Skipped" : "Moved"}</Chip>}
                    href={t.action === "completed" && t.sessionCid && !gone ? `#/progress?session=${encodeURIComponent(t.sessionCid)}` : undefined}
                  />
                </li>
              );
            })}
          </ListGroup>
        )}
      </Section>

      <Button variant="secondary" block onClick={onNewProgram}>
        Switch or start a new program
      </Button>
      <ActiveProgramActions programCid={programCid} program={program} />

      <Sheet open={chooseDay} onClose={() => setChooseDay(false)} title="Pick a day" description="It moves to the front of the queue. The plan stays the same.">
        <ListGroup label="Choose a day">
          {program.days.map((d, i) => (
            <li key={d.dayId}>
              <ListRow
                title={`${i + 1}. ${d.name}`}
                meta={up?.day.dayId === d.dayId ? "Already up next" : `${d.slots.length} exercises`}
                chevron
                onClick={() => {
                  setChooseDay(false);
                  void write(programCid, moveToDay(program, d.dayId, Date.now()));
                }}
              />
            </li>
          ))}
        </ListGroup>
      </Sheet>
    </div>
  );
}
