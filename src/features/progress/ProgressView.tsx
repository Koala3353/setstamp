// Progress tab: this week's numbers, workout history, exercises you've logged, and the
// completed-muscle estimate. Query params open a detail view: ?session=<cid> or ?ex=<exId>.
import { useMemo, useState } from "react";
import { BodyMap, BodyMapLegend } from "../../bodymap";
import { goBack, href, navigate, pathFor, useRoute } from "../../app/router";
import { useRows } from "../../sync/react";
import {
  Button,
  Card,
  EmptyState,
  IconChevronLeft,
  IconChevronRight,
  IconDumbbell,
  IconHistory,
  IconRecord,
  ListGroup,
  ListRow,
  SectionHeader,
  Stat,
  StatGrid,
  TabPanel,
  Tabs,
  tabId,
  tabPanelId,
} from "../../ui";
import { completedCoverage, ESTIMATE_NOTE } from "../coverage/coverage";
import { useExerciseIndex } from "../program/useProgramData";
import { useUserSettings } from "../session/hooks";
import { useExerciseLookup } from "../workout/exerciseInfo";
import { ExerciseHistorySlot } from "./ExerciseHistory";
import { fmtDate, fmtMinutes, fmtVolume } from "./format";
import { MetricsHelp } from "./MetricsSheet";
import { loggedExercises, weeklySummary, weekStart, workoutHistory } from "./model";
import { SessionDetail } from "./SessionDetail";
import "./progress.css";

type View = "workouts" | "exercises" | "muscles";

const weekFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "short",
});
const dayFmt = new Intl.DateTimeFormat(undefined, { day: "numeric" });
const monFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });

/** Stamped date plate for a history row: day numeral over the month. */
function DatePlate({ at }: { at: number }) {
  return (
    <span className="dateplate">
      <span className="dateplate__day num" aria-hidden="true">
        {dayFmt.format(at)}
      </span>
      <span className="dateplate__mon" aria-hidden="true">
        {monFmt.format(at)}
      </span>
      <span className="sr-only">{fullFmt.format(at)}</span>
    </span>
  );
}
const ID = "progress";
// Remembered while the app is open, so returning from a detail view keeps your tab.
let lastView: View = "workouts";

export function ProgressView() {
  const route = useRoute();
  const sessionCid = route.query.get("session");
  const exId = route.query.get("ex");
  if (sessionCid) return <SessionDetail sessionCid={sessionCid} />;
  if (exId) return <ExerciseProgress exId={exId} />;
  return <Overview />;
}

function Overview() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const lookup = useExerciseLookup();
  const { unit } = useUserSettings();
  const [view, setViewState] = useState<View>(lastView);
  const setView = (v: View) => {
    lastView = v;
    setViewState(v);
  };
  // Captured once per mount: "this week" doesn't need to tick while you read.
  const [now] = useState(() => Date.now());

  const history = useMemo(() => workoutHistory(sessions, sets, (id) => lookup(id).tracking), [sessions, sets, lookup]);
  const week = useMemo(() => weeklySummary(sessions, sets, now), [sessions, sets, now]);

  return (
    <div className="stack progress">
      <Card as="section" className="week" aria-labelledby="week-title">
        <SectionHeader level={2} id="week-title" title="This week" meta={`Since ${weekFmt.format(week.weekStart)}`} />
        <StatGrid className="week__stats">
          <Stat label="Workouts" value={week.sessions} />
          <Stat label="Working sets" value={week.workingSets} />
          <Stat label="Exercises" value={week.exercises} />
        </StatGrid>
        {week.workingSets > 0 && (
          <Button variant="ghost" className="week__link" trailingIcon={<IconChevronRight size={20} />} onClick={() => setView("muscles")}>
            Muscles these sets covered
          </Button>
        )}
      </Card>

      <Tabs
        label="Progress views"
        idBase={ID}
        value={view}
        onChange={setView}
        options={[
          { value: "workouts", label: "Workouts" },
          { value: "exercises", label: "Exercises" },
          { value: "muscles", label: "Muscles" },
        ]}
      />
      <TabPanel id={tabPanelId(ID, view)} labelledBy={tabId(ID, view)}>
        {view === "workouts" &&
          (history.length === 0 ? (
            <EmptyState icon={<IconHistory />} title="No finished workouts yet">
              <p>
                Every workout you finish lands here, newest first: date, length, working sets and volume. Nothing is capped or trimmed after
                a few months.
              </p>
            </EmptyState>
          ) : (
            <ListGroup label="Finished workouts">
              {history.map((h) => (
                <li key={h.cid}>
                  <ListRow
                    href={href(`/progress?session=${encodeURIComponent(h.cid)}`)}
                    leading={<DatePlate at={h.startedAt} />}
                    title={h.name}
                    meta={`${fmtMinutes(h.durationSec)} · ${h.workingSets} ${h.workingSets === 1 ? "set" : "sets"}${h.volumeKg > 0 ? ` · ${fmtVolume(h.volumeKg, unit)}` : ""}`}
                  />
                </li>
              ))}
            </ListGroup>
          ))}
        {view === "exercises" && <ExerciseList />}
        {view === "muscles" && <WeekMuscles now={now} />}
      </TabPanel>

      <MetricsHelp />
    </div>
  );
}

function ExerciseList() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const lookup = useExerciseLookup();
  const list = useMemo(() => loggedExercises(sets, sessions), [sets, sessions]);
  if (list.length === 0) {
    return (
      <EmptyState icon={<IconRecord />} title="Records start with your first sets">
        <p>
          Each exercise you log gets its own page: heaviest weight at each rep count, best estimated 1RM, most reps or longest hold, and a
          session-by-session trend.
        </p>
        <p>Exercises are only ever compared with themselves.</p>
      </EmptyState>
    );
  }
  return (
    <ListGroup label="Exercises you've logged">
      {list.map((e) => (
        <li key={e.exId}>
          <ListRow
            href={href(`/progress?ex=${encodeURIComponent(e.exId)}`)}
            title={lookup(e.exId).name}
            meta={`Last ${fmtDate(e.lastAt)} · ${e.sessions} ${e.sessions === 1 ? "workout" : "workouts"}`}
          />
        </li>
      ))}
    </ListGroup>
  );
}

function WeekMuscles({ now }: { now: number }) {
  const sets = useRows("sets");
  const { lookup } = useExerciseIndex();
  const week = weekStart(now);
  const levels = useMemo(() => {
    const done = sets.map((r) => r.data).filter((d): d is NonNullable<typeof d> => !!d);
    return completedCoverage(done, lookup, now, now - week);
  }, [sets, lookup, now, week]);
  const any = Object.keys(levels).length > 0;
  return (
    <div className="stack">
      <p className="muted">
        Estimated working sets per muscle since Monday. {ESTIMATE_NOTE} It shows what you trained, not soreness, recovery or injury.
      </p>
      <Card className="weekmap">
        <BodyMap levels={levels} mode="volume" />
        <BodyMapLegend mode="volume" />
      </Card>
      {!any && <p className="muted small">Nothing finished this week yet. Muscles fill in as you complete working sets.</p>}
      <Button variant="secondary" onClick={() => navigate(pathFor("program"))}>
        Compare with your planned week
      </Button>
    </div>
  );
}

function ExerciseProgress({ exId }: { exId: string }) {
  const lookup = useExerciseLookup();
  const ex = lookup(exId);
  return (
    <div className="stack progress">
      <Button variant="ghost" icon={<IconChevronLeft />} onClick={() => goBack("/progress")} className="progress__back">
        All exercises
      </Button>
      <header className="exprogress__head">
        <h2 className="progress__title">{ex.name}</h2>
        <a className="exprogress__link" href={href(pathFor("exercise", { exId }))}>
          <IconDumbbell size={18} /> How to and muscles
        </a>
      </header>
      <ExerciseHistorySlot exId={exId} />
    </div>
  );
}
