// Stats tab: totals, consistency, volume, strength, exercises and bodyweight over a chosen range.
// Every number comes from stats.ts (finished workouts, done working sets, warm-ups excluded).
import { useMemo, useState } from "react";
import { href } from "../../app/router";
import { kgToDisplay, fmtInt, fmtNum } from "../../logic/units";
import { useRows } from "../../sync/react";
import {
  Card,
  ChipRow,
  EmptyState,
  FilterChip,
  IconHistory,
  ListGroup,
  ListRow,
  SectionHeader,
  Segmented,
  Stat,
  StatGrid,
} from "../../ui";
import { useExerciseIndex } from "../program/useProgramData";
import { useUserSettings } from "../session/hooks";
import { useExerciseLookup } from "../workout/exerciseInfo";
import { fmtDate, fmtLoad } from "./format";
import { StatBars } from "./StatBars";
import {
  bodyweightSeries,
  buckets,
  buildStatsIndex,
  e1rmSeries,
  groupSplit,
  isStatsRange,
  mostTrained,
  overview,
  prsIn,
  prTimeline,
  rangeWindow,
  STATS_RANGES,
  topLifts,
  trainingCalendar,
  weeklyStreak,
  type StatsRange,
} from "./stats";
import { fmtCompact, fmtDuration, fmtEst, fmtPrEvent, GROUP_LABEL, RANGE_LABEL } from "./statsFormat";
import { TrainingCalendar } from "./TrainingCalendar";
import { TrendChart } from "./TrendChart";

const RANGE_KEY = "setstamp.progress.statsRange";
const PR_SHOWN = 6;

function readRange(): StatsRange {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    return isStatsRange(v) ? v : "12w";
  } catch {
    return "12w";
  }
}
function saveRange(r: StatsRange) {
  try {
    localStorage.setItem(RANGE_KEY, r);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

const exHref = (exId: string) => href(`/progress?ex=${encodeURIComponent(exId)}`);
/** Keep a date on one line inside wrapping meta text. */
const nb = (s: string) => s.replace(/ /g, "\u00a0");
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function StatsPanel({ now }: { now: number }) {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const lookup = useExerciseLookup();
  const { lookup: infoOf } = useExerciseIndex();
  const { unit } = useUserSettings();
  const [range, setRangeState] = useState<StatsRange>(readRange);
  const setRange = (r: StatsRange) => {
    setRangeState(r);
    saveRange(r);
  };
  const [volMetric, setVolMetric] = useState<"volume" | "sets">("volume");
  const [liftPick, setLiftPick] = useState<string | null>(null);

  // One pass over every row; everything below works on per-workout summaries.
  const index = useMemo(() => buildStatsIndex(sessions, sets, (id) => lookup(id).tracking), [sessions, sets, lookup]);
  const timeline = useMemo(() => prTimeline(index), [index]);
  const streak = useMemo(() => weeklyStreak(index, now), [index, now]);
  const win = useMemo(() => rangeWindow(index, range, now), [index, range, now]);
  const calWeeks = range === "4w" || range === "12w" ? 12 : 26;
  const cal = useMemo(() => trainingCalendar(index, now, calWeeks), [index, now, calWeeks]);
  const ranged = useMemo(() => {
    const lifts = topLifts(index, win);
    return {
      o: overview(index, win),
      b: buckets(index, win),
      split: groupSplit(index, win, infoOf),
      prs: prsIn(timeline, win),
      trained: mostTrained(index, win),
      lifts,
      bodyweight: bodyweightSeries(index, win),
    };
  }, [index, win, infoOf, timeline]);
  const lift = liftPick && ranged.lifts.includes(liftPick) ? liftPick : (ranged.lifts[0] ?? null);
  const liftPoints = useMemo(() => (lift ? e1rmSeries(index, lift, win) : []), [index, lift, win]);

  if (index.sessions.length === 0) {
    return (
      <EmptyState icon={<IconHistory />} title="No stats yet">
        <p>
          Finish a workout and this fills in: totals, training days, weekly volume, records and your most-trained exercises, over 4
          weeks, 12 weeks, a year or all time.
        </p>
      </EmptyState>
    );
  }

  const { o, b, split, prs, trained, lifts, bodyweight } = ranged;
  const per = b.unit;
  const time = fmtDuration(o.timeSec);
  const avgMin = o.avgSessionSec !== null ? Math.round(o.avgSessionSec / 60) : null;
  const sinceText = range === "all" ? `Since ${fmtDate(win.from, now)}` : `${RANGE_LABEL[range]}, since ${fmtDate(win.from, now)}`;
  const toUnit = (kg: number) => kgToDisplay(kg, unit) ?? 0;
  const maxGroup = split.groups[0]?.sets ?? 0;

  return (
    <div className="stack stats">
      <Segmented
        label="Time range"
        className="stats__range"
        value={range}
        onChange={setRange}
        options={STATS_RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
      />

      <Card as="section" className="stats__section" aria-labelledby="stats-overview">
        <SectionHeader level={2} id="stats-overview" title="Overview" meta={sinceText} />
        {o.workouts === 0 && <p className="muted small">No finished workouts in this range. Pick a longer one to see more.</p>}
        <StatGrid className="stats__grid">
          <Stat label="Workouts" value={fmtInt(o.workouts)} />
          <Stat label="Working sets" value={fmtInt(o.workingSets)} note="Warm-ups not counted" />
          <Stat label="Volume" value={fmtInt(toUnit(o.volumeKg))} unit={unit} note="Weight × reps" />
          <Stat label="Time trained" value={time.value} unit={time.unit} />
          <Stat label="Average workout" value={avgMin !== null ? fmtInt(avgMin) : "–"} unit={avgMin !== null ? "min" : undefined} note={avgMin === null && o.workouts > 0 ? "No timed workouts" : undefined} />
          <Stat label="Workouts per week" value={fmtNum(Math.round(o.perWeek * 10) / 10)} note={`Over ${plural(o.weeks, "week")}`} />
        </StatGrid>
        <div className="stats__streak">
          <Stat label="Weeks in a row with a workout" value={fmtInt(streak.weeks)} />
          <p className="small muted">
            Calendar weeks, Monday to Sunday, with at least one finished workout.{" "}
            {streak.includesThisWeek ? "This week is included." : "This week isn't over, so the count runs to last week."}
          </p>
        </div>
      </Card>

      <Card as="section" className="stats__section" aria-labelledby="stats-consistency">
        <SectionHeader level={2} id="stats-consistency" title="Consistency" meta={`Training days, last ${calWeeks} weeks`} />
        <TrainingCalendar cal={cal} now={now} />
        <h3 className="stats__sub">Workouts per {per}</h3>
        <StatBars
          data={b.list.map((x) => ({ start: x.start, value: x.workouts, current: x.current }))}
          unit={per}
          label="Workouts"
          format={(v) => plural(v, "workout")}
        />
      </Card>

      <Card as="section" className="stats__section" aria-labelledby="stats-volume">
        <SectionHeader level={2} id="stats-volume" title="Volume" meta={`Per ${per}, working sets only`} />
        <Segmented
          label="Volume measure"
          className="stats__toggle"
          value={volMetric}
          onChange={setVolMetric}
          options={[
            { value: "volume", label: "Volume" },
            { value: "sets", label: "Sets" },
          ]}
        />
        {volMetric === "volume" ? (
          <StatBars
            key="volume"
            data={b.list.map((x) => ({ start: x.start, value: toUnit(x.volumeKg), current: x.current }))}
            unit={per}
            label={`Volume (${unit})`}
            format={(v) => `${fmtInt(v)} ${unit}`}
            tick={fmtCompact}
          />
        ) : (
          <StatBars
            key="sets"
            data={b.list.map((x) => ({ start: x.start, value: x.workingSets, current: x.current }))}
            unit={per}
            label="Working sets"
            format={(v) => plural(v, "set")}
          />
        )}
        {volMetric === "volume" && <p className="small muted">Weight × reps on rep-based sets. Holds, carries and assisted sets add none.</p>}

        <h3 className="stats__sub">By muscle group</h3>
        {split.groups.length === 0 ? (
          <p className="small muted">No working sets in this range.</p>
        ) : (
          <>
            <ul className="stats__groups" aria-label="Estimated working sets by muscle group">
              {split.groups.map((g) => (
                <li key={g.group} className="stats__group">
                  <span className="stats__group-name">{GROUP_LABEL[g.group]}</span>
                  <span className="stats__group-track" aria-hidden="true">
                    <span className="stats__group-bar" style={{ width: `${Math.max(2, (g.sets / maxGroup) * 100)}%` }} />
                  </span>
                  <span className="stats__group-val num">{fmtEst(g.sets)}</span>
                </li>
              ))}
            </ul>
            <p className="small muted">
              Estimated sets: 1 for a group the exercise mainly works, ½ for one it also works. Not a measure of stimulus or recovery.
              {split.unmapped > 0 && ` ${plural(split.unmapped, "set")} from exercises without muscle data aren't included.`}
            </p>
          </>
        )}
      </Card>

      <Card as="section" className="stats__section" aria-labelledby="stats-strength">
        <SectionHeader level={2} id="stats-strength" title="Strength" meta={prs.length ? `${plural(prs.length, "workout")} with a record` : undefined} />
        <h3 className="stats__sub">Recent records</h3>
        {prs.length === 0 ? (
          <p className="small muted">No new records in this range. A record has to beat something you logged before, so first sessions don't count.</p>
        ) : (
          <ListGroup label="Recent records">
            {prs.slice(0, PR_SHOWN).map((m) => (
              <li key={`${m.sessionCid}-${m.exId}`}>
                <ListRow
                  href={exHref(m.exId)}
                  title={lookup(m.exId).name}
                  meta={
                    <>
                      <span className="stats__prdate">{fmtDate(m.at, now)}</span>
                      {m.events.map((e) => (
                        <span key={e.kind} className="stats__prline">
                          {fmtPrEvent(e, unit)}
                        </span>
                      ))}
                    </>
                  }
                />
              </li>
            ))}
          </ListGroup>
        )}
        {prs.length > PR_SHOWN && <p className="small muted">{plural(prs.length - PR_SHOWN, "more workout")} with a record in this range. Each exercise page lists its own.</p>}

        <h3 className="stats__sub">Estimated 1RM</h3>
        {lifts.length === 0 || !lift ? (
          <p className="small muted">Log a weighted set of 10 reps or fewer to see an estimated 1RM trend.</p>
        ) : (
          <>
            {lifts.length > 1 && (
              <ChipRow label="Lift">
                {lifts.map((id) => (
                  <FilterChip key={id} selected={id === lift} onChange={() => setLiftPick(id)}>
                    {lookup(id).name}
                  </FilterChip>
                ))}
              </ChipRow>
            )}
            <TrendChart points={liftPoints} metric="e1rm" unit={unit} />
            <p className="small muted">
              {lifts.length === 1 ? `${lookup(lift).name}. ` : ""}Best estimate each workout (Epley, sets of 10 reps or fewer). An estimate,
              not a tested max.{" "}
              <a href={exHref(lift)} className="stats__link">
                All records for this lift
              </a>
            </p>
          </>
        )}
      </Card>

      <Card as="section" className="stats__section" aria-labelledby="stats-exercises">
        <SectionHeader level={2} id="stats-exercises" title="Most trained" meta="By working sets in this range" />
        {trained.length === 0 ? (
          <p className="small muted">No working sets in this range.</p>
        ) : (
          <ListGroup label="Most-trained exercises">
            {trained.map((e) => (
              <li key={e.exId}>
                <ListRow
                  href={exHref(e.exId)}
                  title={lookup(e.exId).name}
                  meta={`${plural(e.sets, "set")} · ${plural(e.workouts, "workout")} · last ${nb(fmtDate(e.lastAt, now))}`}
                />
              </li>
            ))}
          </ListGroup>
        )}
      </Card>

      {bodyweight.length > 0 && (
        <Card as="section" className="stats__section" aria-labelledby="stats-bodyweight">
          <SectionHeader level={2} id="stats-bodyweight" title="Bodyweight" meta="As recorded on your workouts" />
          <TrendChart
            points={bodyweight}
            metric="load"
            unit={unit}
            label="Bodyweight"
            format={(kg) => fmtLoad(kg, unit)}
            markBest={false}
          />
        </Card>
      )}
    </div>
  );
}

