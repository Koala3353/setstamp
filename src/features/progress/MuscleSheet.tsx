// Detail sheet for one muscle on the Progress body map: this week vs last week, a weekly trend,
// top exercises and recent sessions. Every number is an estimate of logged exposure, nothing more.
import { useMemo } from "react";
import { href, pathFor } from "../../app/router";
import { MUSCLE_INFO, type Muscle } from "../../shared/domain";
import type { SessionData, SetData } from "../../shared/sync";
import { ListGroup, ListRow, Sheet } from "../../ui";
import type { ExerciseInfo, ExerciseLookup } from "../coverage/coverage";
import { calendarDaysBetween, compareWeeks, fmtSets, muscleStats, starterExercises, type SessionInfo } from "../coverage/muscleStats";
import { MuscleWeekChart } from "./MuscleWeekChart";
import { fmtDate } from "./format";

export const MUSCLE_ESTIMATE_LABEL = "Estimated sets: primary counts 1, secondary counts 0.5.";

const GROUP_LABEL: Record<string, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  back: "Back",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
  other: "Other",
};
const VIEW_NOTE = { front: "front view", back: "back view", both: "front and back views" } as const;

function describeMuscle(info: (typeof MUSCLE_INFO)[Muscle]): string {
  const group = GROUP_LABEL[info.group] ?? info.group;
  const where = `Shown on the ${VIEW_NOTE[info.view]}`;
  // "Chest · Chest" says nothing; name the group only when it adds something.
  return group.toLowerCase() === info.label.toLowerCase() || info.group === "other" ? where : `${group} · ${where.toLowerCase()}`;
}

const sets1 = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;

function daysAgo(at: number, now: number): string {
  const d = calendarDaysBetween(at, now);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

type Row<T> = { cid: string; data: T | null };

export function MuscleSheet({
  muscle,
  open,
  onClose,
  sets,
  sessions,
  lookup,
  catalog,
  now,
}: {
  /** The muscle shown. Keep it set while closing so the content doesn't vanish mid-animation. */
  muscle: Muscle | null;
  open: boolean;
  onClose: () => void;
  sets: readonly Row<SetData>[];
  sessions: readonly Row<SessionData>[];
  lookup: ExerciseLookup;
  catalog: readonly ExerciseInfo[];
  now: number;
}) {
  const sessionOf = useMemo(() => {
    const m = new Map<string, SessionInfo>();
    for (const r of sessions) if (r.data) m.set(r.cid, { name: r.data.name, startedAt: r.data.startedAt });
    return (cid: string) => m.get(cid);
  }, [sessions]);
  const doneSets = useMemo(() => sets.map((r) => r.data).filter((d): d is SetData => !!d), [sets]);
  const stats = useMemo(
    () => (muscle ? muscleStats(muscle, doneSets, sessionOf, lookup, now, { weeks: 10 }) : null),
    [muscle, doneSets, sessionOf, lookup, now],
  );
  const starters = useMemo(() => (muscle && stats && !stats.hasAny ? starterExercises(muscle, catalog, 3) : []), [muscle, stats, catalog]);

  const info = muscle ? MUSCLE_INFO[muscle] : null;
  const label = info?.label ?? "";
  const lower = label.toLowerCase();

  return (
    <Sheet
      open={open && muscle !== null}
      onClose={onClose}
      title={label}
      description={info ? describeMuscle(info) : undefined}
      className="msheet"
    >
      {stats && (
        <div className="msheet__body">
          <p className="msheet__note">{MUSCLE_ESTIMATE_LABEL} It shows what you logged, not recovery or soreness.</p>

          {!stats.hasAny ? (
            <section className="msheet__group" aria-labelledby="msheet-empty">
              <h3 id="msheet-empty" className="msheet__title">
                No sets logged for {lower} yet
              </h3>
              {starters.length > 0 ? (
                <>
                  <p className="msheet__plain">Common exercises that list {lower} as a primary muscle:</p>
                  <ListGroup label={`Exercises for ${label}`}>
                    {starters.map((e) => (
                      <li key={e.exId}>
                        <ListRow href={href(pathFor("exercise", { exId: e.exId }))} title={e.name} meta="Primary" />
                      </li>
                    ))}
                  </ListGroup>
                </>
              ) : (
                <p className="msheet__plain">Sets show here once you log an exercise that works {lower}.</p>
              )}
            </section>
          ) : (
            <>
              <section className="msheet__group" aria-labelledby="msheet-week">
                <h3 id="msheet-week" className="msheet__title">
                  This week
                </h3>
                <div className="msheet__week">
                  <p className="msheet__big">
                    <span className="num msheet__bignum">{fmtSets(stats.thisWeek.estimated)}</span>
                    <span className="msheet__bigunit">est. sets</span>
                  </p>
                  <dl className="msheet__facts">
                    <div>
                      <dt>Split</dt>
                      <dd>
                        {sets1(stats.thisWeek.primarySets)} primary, {sets1(stats.thisWeek.secondarySets)} secondary
                      </dd>
                    </div>
                    <div>
                      <dt>Last week</dt>
                      <dd>
                        <span className="num">{fmtSets(stats.lastWeek.estimated)}</span> ·{" "}
                        {compareWeeks(stats.thisWeek.estimated, stats.lastWeek.estimated).replace(" than last week", "")}
                      </dd>
                    </div>
                    <div>
                      <dt>Last trained</dt>
                      <dd>
                        {fmtDate(stats.lastTrainedAt!, now)}, {daysAgo(stats.lastTrainedAt!, now)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              <section className="msheet__group" aria-labelledby="msheet-trend">
                <h3 id="msheet-trend" className="msheet__title">
                  Last {stats.weeks.length} weeks
                </h3>
                <MuscleWeekChart weeks={stats.weeks} muscleLabel={label} />
              </section>

              <section className="msheet__group" aria-labelledby="msheet-top">
                <h3 id="msheet-top" className="msheet__title">
                  Top exercises, last 4 weeks
                </h3>
                {stats.topExercises.length === 0 ? (
                  <p className="msheet__plain">Nothing logged for {lower} in the last 4 weeks.</p>
                ) : (
                  <ListGroup label={`Top exercises for ${label}`}>
                    {stats.topExercises.map((t) => (
                      <li key={t.exId}>
                        <ListRow
                          href={href(pathFor("exercise", { exId: t.exId }))}
                          title={t.name}
                          meta={`${t.role === "primary" ? "Primary" : "Secondary"} · ${sets1(t.sets)}${t.role === "secondary" ? ` (counts ${fmtSets(t.estimated)})` : ""}`}
                        />
                      </li>
                    ))}
                  </ListGroup>
                )}
              </section>

              <section className="msheet__group" aria-labelledby="msheet-recent">
                <h3 id="msheet-recent" className="msheet__title">
                  Recent sessions
                </h3>
                <ListGroup label={`Recent sessions with ${label}`}>
                  {stats.recentSessions.map((r) => (
                    <li key={r.sessionCid}>
                      <ListRow
                        href={sessions.some((s) => s.cid === r.sessionCid && s.data) ? href(`/progress?session=${encodeURIComponent(r.sessionCid)}`) : undefined}
                        title={r.name}
                        meta={`${fmtDate(r.at, now)} · ${sets1(r.sets)}${r.estimated !== r.sets ? ` (counts ${fmtSets(r.estimated)})` : ""}`}
                      />
                    </li>
                  ))}
                </ListGroup>
              </section>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
