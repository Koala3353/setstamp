import { useMemo, useState } from "react";
import { Button, Card, EmptyState, IconHistory, IconPlay, IconProgram, ListGroup, ListRow, Stat, StatGrid } from "../../ui";
import { useActiveWorkout } from "../activeWorkout";
import { href, navigate } from "../router";
import { ScreenAction, Section } from "../Shell";
import { formatDuration, useNow } from "../useNow";
import { useRow, useRows, useSyncStore } from "../../sync/react";
import { useUserSettings } from "../../features/session/hooks";
import { useExerciseLookup } from "../../features/workout/exerciseInfo";
import { repeatSession, startProgramDay } from "../../features/workout/ops";
import { RestBar } from "../../features/workout/RestBar";
import { useOpenSession } from "../../features/workout/useWorkout";
import { volumeLoad } from "../../logic/metrics";
import { fmtMinutes, fmtVolume } from "../../features/progress/format";
import { estimateDayMinutes } from "../../features/coverage/coverage";
import "../../features/workout/workout.css";

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const shortDate = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** How many planned exercises Up next lists before folding the rest into "+N more". */
const PLAN_PREVIEW = 6;

function dose(s: { sets: number; durationSec: number | null; repMin: number | null; repMax: number | null }): string {
  const target = s.durationSec ? `${s.durationSec}s` : s.repMin !== null && s.repMax !== null && s.repMin !== s.repMax ? `${s.repMin}–${s.repMax}` : (s.repMax ?? s.repMin ?? "");
  return `${s.sets} × ${target}`;
}

export function TodayScreen() {
  const { start } = useActiveWorkout();
  const open = useOpenSession();
  const store = useSyncStore();
  const settings = useUserSettings();
  const lookup = useExerciseLookup();
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("sessionExercises");
  const program = useRow("programs", settings.activeProgramCid);
  const now = useNow(1000);
  const [busy, setBusy] = useState(false);

  const prog = program?.data && !program.data.archived ? program.data : null;
  const day = prog && prog.days.length ? prog.days[((prog.nextDayIndex % prog.days.length) + prog.days.length) % prog.days.length] : null;

  const finished = useMemo(
    () => sessions.filter((r) => r.data && r.data.endedAt !== null).sort((a, b) => b.data!.startedAt - a.data!.startedAt),
    [sessions],
  );
  const recent = finished.slice(0, 3).map((r) => {
    const mine = sets.filter((s) => s.data?.sessionCid === r.cid && s.data.done).map((s) => s.data!);
    const volume = mine.reduce((v, s) => v + volumeLoad([s], lookup(s.exId).tracking), 0);
    return { cid: r.cid, data: r.data!, sets: mine.filter((s) => s.kind !== "warmup").length, volume };
  });
  const [weekStart] = useState(() => Date.now() - WEEK_MS);
  const week = useMemo(() => {
    const ids = new Set(finished.filter((r) => r.data!.startedAt >= weekStart).map((r) => r.cid));
    const working = sets.filter((s) => s.data && ids.has(s.data.sessionCid) && s.data.done && s.data.kind !== "warmup").length;
    return { sessions: ids.size, working };
  }, [finished, sets, weekStart]);
  const openSets = open ? sets.filter((s) => s.data?.sessionCid === open.cid && s.data.done && s.data.kind !== "warmup").length : 0;

  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      navigate("/workout");
    } finally {
      setBusy(false);
    }
  };
  const history = { sessions, sets };
  const startDay = () => store && prog && day && settings.activeProgramCid && go(() => startProgramDay(store, settings.activeProgramCid!, prog, day, history, settings, lookup));
  const startEmpty = () => {
    start("Workout");
    navigate("/workout");
  };
  const last = finished[0];
  const repeatLast = () => store && last?.data && go(() => repeatSession(store, last.cid, last.data!, exercises, sets));

  const dayIndex = prog && day ? prog.days.indexOf(day) : -1;
  const plannedSets = day ? day.slots.reduce((a, x) => a + x.sets, 0) : 0;

  return (
    <div className="screen">
      <p className="screen-kicker">{dateFmt.format(new Date())}</p>

      {open ? (
        <Section title="In progress" id="today-open">
          <Card className="td-live">
            <h3 className="td-live__name">{open.data.name}</h3>
            <StatGrid>
              <Stat label="Elapsed" value={formatDuration((now - open.data.startedAt) / 1000)} />
              <Stat label={openSets === 1 ? "Working set logged" : "Working sets logged"} value={openSets} tone={openSets > 0 ? "ok" : "default"} />
            </StatGrid>
          </Card>
        </Section>
      ) : prog && day ? (
        <Section
          title="Up next"
          id="today-next"
          meta={`${prog.name} · day ${dayIndex + 1} of ${prog.days.length}`}
          aside={
            <Button variant="ghost" onClick={() => navigate("/program")}>
              Plan
            </Button>
          }
        >
          <Card padded={false} className="td-next">
            <div className="td-next__head">
              <h3 className="td-next__name">{day.name}</h3>
              <p className="td-next__meta">
                <span className="num">{day.slots.length}</span> {day.slots.length === 1 ? "exercise" : "exercises"} · <span className="num">{plannedSets}</span> working sets · about{" "}
                <span className="num">{estimateDayMinutes(day, settings.defaultRestSec)}</span> min
              </p>
            </div>
            {day.slots.length > 0 && (
              <ol className="td-plan" aria-label={`${day.name} exercises`}>
                {day.slots.slice(0, PLAN_PREVIEW).map((x, i) => (
                  <li key={x.slotId}>
                    <span className="td-plan__no num">{i + 1}</span>
                    <span className="td-plan__name">{lookup(x.exId).name}</span>
                    <span className="td-plan__dose num">{dose(x)}</span>
                  </li>
                ))}
              </ol>
            )}
            {day.slots.length > PLAN_PREVIEW && <p className="td-plan__more">+{day.slots.length - PLAN_PREVIEW} more</p>}
          </Card>
        </Section>
      ) : (
        <EmptyState
          framed
          icon={<IconProgram />}
          title="No program yet"
          action={
            <Button variant="secondary" onClick={() => navigate("/program")}>
              Choose a program
            </Button>
          }
        >
          <p>Pick a split and your days queue up in order. Miss a day and nothing shifts: the next workout just waits for you.</p>
        </EmptyState>
      )}

      {!open && (
        <div className="td-alt" role="group" aria-label="Other ways to start">
          {prog && day && (
            <Button onClick={startEmpty} disabled={busy}>
              Start empty
            </Button>
          )}
          {last && (
            <Button onClick={() => void repeatLast()} disabled={busy}>
              Repeat last
            </Button>
          )}
        </div>
      )}

      <Section
        title="Recent"
        id="today-last"
        meta={
          week.sessions > 0 ? (
            <>
              Last 7 days: <span className="num">{week.sessions}</span> {week.sessions === 1 ? "workout" : "workouts"}, <span className="num">{week.working}</span> working sets
            </>
          ) : undefined
        }
      >
        {recent.length ? (
          <ListGroup label="Recent workouts">
            {recent.map((r) => (
              <li key={r.cid}>
                <ListRow
                  href={href(`/progress?session=${encodeURIComponent(r.cid)}`)}
                  title={r.data.name}
                  meta={
                    <span className="num">
                      {shortDate.format(new Date(r.data.startedAt))} · {fmtMinutes(((r.data.endedAt ?? r.data.startedAt) - r.data.startedAt) / 1000)} · {r.sets} {r.sets === 1 ? "set" : "sets"}
                    </span>
                  }
                  trailing={r.volume > 0 ? <span className="td-recent__vol num">{fmtVolume(r.volume, settings.unit)}</span> : undefined}
                />
              </li>
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon={<IconHistory />} title="Nothing logged yet">
            <p>Your recent workouts will show here.</p>
          </EmptyState>
        )}
      </Section>

      <ScreenAction>
        <div className="wk-dock">
          <RestBar />
          {open ? (
            <Button variant="primary" size="lg" block icon={<IconPlay size={20} />} onClick={() => navigate("/workout")}>
              Continue workout
            </Button>
          ) : prog && day ? (
            <Button variant="primary" size="lg" block icon={<IconPlay size={20} />} loading={busy} onClick={() => void startDay()}>
              Start {day.name}
            </Button>
          ) : (
            <Button variant="primary" size="lg" block icon={<IconPlay size={20} />} onClick={startEmpty}>
              Start empty workout
            </Button>
          )}
        </div>
      </ScreenAction>
    </div>
  );
}
