// Training days as a calendar grid: one column per week (Monday on top), one cell per day.
// Sequential record blue: empty, 1 workout, 2 or more. Days still to come are left blank.
// Tap a day (or move with the arrow keys) to read it; the list underneath names every training day.
import { useState, type KeyboardEvent } from "react";
import type { TrainingCalendar as Cal } from "./stats";
import { fmtDate } from "./format";

const WIDTH = 320;
const GAP = 2;
const PAD_L = 16;
const PAD_T = 14;
const ROW_LABELS: Record<number, string> = { 0: "M", 2: "W", 4: "F", 6: "S" };

const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
const listFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : 2);
const workouts = (n: number) => `${n} ${n === 1 ? "workout" : "workouts"}`;

export function TrainingCalendar({ cal, now }: { cal: Cal; now: number }) {
  const { weeks, days } = cal;
  const todayIdx = days.findIndex((d, i) => !d.future && (i === days.length - 1 || days[i + 1]!.future));
  // Fixed drawing width so text keeps one size whatever the week count; cells grow to fill it.
  const CELL = Math.min(22, (WIDTH - PAD_L) / weeks - GAP);
  let lastTrained = -1;
  for (let i = todayIdx; i >= 0; i--) if (days[i]!.workouts > 0) {
    lastTrained = i;
    break;
  }
  const [picked, setPicked] = useState<number | null>(null);
  // Starts on the most recent training day (today if there is none).
  const sel = picked ?? (lastTrained >= 0 ? lastTrained : todayIdx);
  const selDay = days[sel];

  const W = PAD_L + weeks * (CELL + GAP);
  const H = PAD_T + 7 * (CELL + GAP);
  const xOf = (col: number) => PAD_L + col * (CELL + GAP);
  const yOf = (row: number) => PAD_T + row * (CELL + GAP);

  // Month name over the first column whose Monday falls in a new month (spaced out so they never collide).
  const monthMarks: Array<{ col: number; text: string }> = [];
  let lastMonth = -1;
  for (let c = 0; c < weeks; c++) {
    const m = new Date(days[c * 7]!.at).getMonth();
    if (m !== lastMonth) {
      const prev = monthMarks[monthMarks.length - 1];
      if (!prev || c - prev.col >= 3) monthMarks.push({ col: c, text: monthFmt.format(days[c * 7]!.at) });
      lastMonth = m;
    }
  }

  const trained = days.filter((d) => d.workouts > 0);
  const summary =
    trained.length === 0
      ? `No workouts in the last ${weeks} weeks.`
      : `Trained on ${trained.length} of the last ${weeks * 7} days (${weeks} weeks).`;

  const onKey = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowLeft" ? -7 : e.key === "ArrowRight" ? 7 : e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = sel + delta;
    if (next >= 0 && next < days.length && !days[next]!.future) setPicked(next);
  };

  return (
    <figure className="tcal">
      <p className="tcal__readout" aria-live="polite">
        {selDay ? (
          <>
            <span className="tcal__value num">{selDay.workouts}</span>
            <span className="tcal__when">
              {selDay.workouts === 1 ? "workout" : "workouts"} · {fmtDate(selDay.at, now)}
            </span>
          </>
        ) : null}
      </p>
      <div className="tcal__plot" tabIndex={0} role="group" aria-label={`${summary} Arrow keys move by day and week.`} onKeyDown={onKey}>
        <svg viewBox={`0 0 ${W} ${H}`} className="tcal__svg" aria-hidden="true" focusable="false">
          {monthMarks.map((m) => (
            <text key={m.col} className="tcal__tick" x={xOf(m.col)} y={PAD_T - 4}>
              {m.text}
            </text>
          ))}
          {Object.entries(ROW_LABELS).map(([row, t]) => (
            <text key={row} className="tcal__tick" x={0} y={yOf(Number(row)) + CELL / 2} dominantBaseline="middle">
              {t}
            </text>
          ))}
          {days.map((d, i) =>
            d.future ? null : (
              <rect
                key={d.at}
                className={`tcal__cell tcal__cell--${level(d.workouts)}${i === sel ? " is-sel" : ""}`}
                x={xOf(Math.floor(i / 7))}
                y={yOf(i % 7)}
                width={CELL}
                height={CELL}
                rx={2}
                onPointerEnter={(e) => e.pointerType === "mouse" && setPicked(i)}
                onClick={() => setPicked(i)}
              />
            ),
          )}
        </svg>
      </div>
      <figcaption className="tcal__legend">
        <span>{summary}</span>
        <span className="tcal__scale" aria-hidden="true">
          None <i className="tcal__key tcal__cell--0" /> <i className="tcal__key tcal__cell--1" /> 1{" "}
          <i className="tcal__key tcal__cell--2" /> 2+
        </span>
      </figcaption>
      {trained.length > 0 && (
        <details className="trend__table">
          <summary>List training days</summary>
          <ul className="tcal__list">
            {[...trained].reverse().map((d) => (
              <li key={d.at}>
                <span>{listFmt.format(d.at)}</span>
                <span className="num">{workouts(d.workouts)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </figure>
  );
}
