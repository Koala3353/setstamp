// One exercise's history: records, a per-session trend and recent sessions' sets.
// Mounted by ExerciseDetail (as `ExerciseHistorySlot`) and by the Progress screen's exercise view.
import { useMemo, useState } from "react";
import { useRows } from "../../sync/react";
import { IconChevronRight, SectionHeader, Segmented, Stat } from "../../ui";
import { useUserSettings } from "../session/hooks";
import { useExerciseLookup } from "../workout/exerciseInfo";
import { fmtDate, fmtSet, KIND_LABEL, METRIC_DESCRIPTION, METRIC_LABEL, prTitle, prValue } from "./format";
import { MetricsHelp } from "./MetricsSheet";
import { exerciseSessions, metricsFor, prCards, trendSeries, type TrendMetric } from "./model";
import { TrendChart } from "./TrendChart";
import { href } from "../../app/router";
import "./progress.css";

const RECENT = 5;

export function ExerciseHistorySlot({ exId }: { exId: string }) {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const { unit } = useUserSettings();
  const lookup = useExerciseLookup();
  const tracking = lookup(exId).tracking;

  const history = useMemo(() => exerciseSessions(exId, sessions, sets), [exId, sessions, sets]);
  const allSets = useMemo(() => history.flatMap((h) => h.sets), [history]);
  const cards = useMemo(() => prCards(allSets, tracking), [allSets, tracking]);
  const metrics = useMemo(() => metricsFor(tracking, allSets), [tracking, allSets]);
  const [picked, setPicked] = useState<TrendMetric | null>(null);
  const metric = picked && metrics.includes(picked) ? picked : metrics[0]!;
  const points = useMemo(() => trendSeries([...history].reverse(), metric), [history, metric]);

  if (history.length === 0) {
    return (
      <section className="exhist" aria-labelledby={`exhist-${exId}`}>
        <SectionHeader id={`exhist-${exId}`} title="Your history" />
        <p className="muted">
          Nothing logged for this exercise yet. Once you finish a set, your records and a session-by-session trend show up here.
        </p>
      </section>
    );
  }

  return (
    <section className="exhist" aria-labelledby={`exhist-${exId}`}>
      <SectionHeader
        id={`exhist-${exId}`}
        title="Your history"
        meta={`${history.length} ${history.length === 1 ? "session" : "sessions"} · last ${fmtDate(history[0]!.startedAt)}`}
      />

      {cards.length > 0 && (
        <div className="exhist__block">
          <SectionHeader level={3} title="Records" />
          <ul className="prs" aria-label="Records for this exercise">
            {cards.map((c) => {
              const v = prValue(c, unit);
              return (
                <li key={`${c.kind}-${"reps" in c ? c.reps : ""}`} className="prs__card">
                  <Stat
                    tone="record"
                    label={prTitle(c, unit)}
                    value={v.value}
                    unit={v.unit}
                    note={c.kind === "e1rm" ? "Estimate (Epley, sets of ≤10 reps)" : undefined}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="exhist__block">
        <SectionHeader level={3} title="Trend" meta={METRIC_DESCRIPTION[metric]} />
        {metrics.length > 1 && (
          <Segmented<TrendMetric>
            label="Trend measure"
            value={metric}
            onChange={setPicked}
            options={metrics.map((m) => ({ value: m, label: METRIC_LABEL[m] }))}
          />
        )}
        {points.length > 0 ? (
          <TrendChart points={points} metric={metric} unit={unit} />
        ) : (
          <p className="muted small">No working sets with this measure yet.</p>
        )}
      </div>

      <div className="exhist__block">
        <SectionHeader
          level={3}
          title="Recent sessions"
          meta={history.length > RECENT ? `Latest ${RECENT} of ${history.length}` : undefined}
        />
        <ol className="exhist__sessions">
          {history.slice(0, RECENT).map((h) => (
            <li key={h.sessionCid} className="exhist__session">
              <a className="exhist__sessionhead" href={href(`/progress?session=${encodeURIComponent(h.sessionCid)}`)}>
                <span className="exhist__date">{fmtDate(h.startedAt)}</span>
                <span className="exhist__name">{h.name}</span>
                <IconChevronRight size={18} className="exhist__chev" />
              </a>
              <ol className="setlist">
                {numberWorking(h.sets).map(({ s, n }, i) => (
                  <li key={i} className={s.kind === "warmup" ? "setlist__row setlist__row--warm" : "setlist__row"}>
                    <span className="setlist__kind">{s.kind === "working" ? `Set ${n}` : KIND_LABEL[s.kind]}</span>
                    <span className="setlist__val num">{fmtSet(s, unit)}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>

      <MetricsHelp />
    </section>
  );
}

export default ExerciseHistorySlot;

/** Pairs each set with its working-set number ("Set 1", "Set 2"); warm-ups and other kinds get 0. */
function numberWorking<T extends { kind: string }>(sets: readonly T[]): Array<{ s: T; n: number }> {
  let n = 0;
  return sets.map((s) => ({ s, n: s.kind === "working" ? ++n : 0 }));
}
