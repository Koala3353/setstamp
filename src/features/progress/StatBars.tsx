// One magnitude per week (or month): a single-series column chart in record blue, because these
// are things you have done. The bucket still in progress is drawn hatched and says "so far".
// Tap or hover a bar for its value; arrow keys move between bars; a table carries every value.
import { useId, useState, type KeyboardEvent } from "react";
import { niceStep } from "./chart";
import { fmtShortDate } from "./format";

const W = 320;
const H = 140;
const PAD_L = 34;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 22;
const R = 3;

export type BarDatum = { start: number; value: number; current: boolean };

const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const monthShort = new Intl.DateTimeFormat(undefined, { month: "short" });

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function StatBars({
  data,
  unit,
  label,
  format,
  tick,
}: {
  data: readonly BarDatum[];
  unit: "week" | "month";
  /** What a bar measures, e.g. "Workouts". */
  label: string;
  /** Display value with its unit: "3 workouts", "12,450 kg". */
  format: (v: number) => string;
  /** Axis tick text (no unit): "12k". */
  tick?: (v: number) => string;
}) {
  const uid = "sb" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const last = data.length - 1;
  const [picked, setPicked] = useState<number | null>(null);
  if (data.length === 0) return null;
  const sel = picked !== null && picked <= last ? picked : last;
  const selD = data[sel]!;

  const name = (d: BarDatum) =>
    unit === "week"
      ? d.current
        ? "This week so far"
        : `Week of ${fmtShortDate(d.start)}`
      : d.current
        ? "This month so far"
        : monthFmt.format(d.start);

  const maxV = Math.max(0, ...data.map((d) => d.value));
  const step = niceStep(maxV > 0 ? maxV : 1, 2);
  const top = Math.max(step, Math.ceil(maxV / step) * step);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slot = innerW / data.length;
  const barW = Math.max(2, Math.min(22, slot - 2));
  const yOf = (v: number) => PAD_T + innerH - (v / top) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);

  const active = data.filter((d) => d.value > 0).length;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]!);
  const per = unit === "week" ? "week" : "month";
  const summary =
    active === 0
      ? `${label} per ${per}: none in this range.`
      : `${label} per ${per} over ${data.length} ${per}s. ${active} of ${data.length} had any; highest ${format(peak.value)} (${name(peak).toLowerCase()}). Latest: ${format(data[last]!.value)}.`;

  const onKey = (e: KeyboardEvent) => {
    let next = -1;
    if (e.key === "ArrowLeft") next = Math.max(0, sel - 1);
    else if (e.key === "ArrowRight") next = Math.min(last, sel + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    setPicked(next);
  };
  const xLabel = (d: BarDatum) => (d.current ? (unit === "week" ? "This wk" : "This mo") : unit === "week" ? fmtShortDate(d.start) : monthShort.format(d.start));
  const labelled = new Set([0, last, Math.floor(last / 2)]);

  return (
    <figure className="sbars">
      <p className="sbars__readout" aria-live="polite">
        <span className="sbars__value num">{format(selD.value)}</span>
        <span className="sbars__when">{name(selD)}</span>
      </p>
      <div className="sbars__plot" tabIndex={0} role="group" aria-label={`${summary} Use left and right arrow keys to read each ${per}.`} onKeyDown={onKey}>
        <svg viewBox={`0 0 ${W} ${H}`} className="sbars__svg" aria-hidden="true" focusable="false">
          <defs>
            <pattern id={`${uid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" className="sbars__hatch-bg" />
              <line x1="1" y1="0" x2="1" y2="4" className="sbars__hatch-line" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "sbars__base" : "sbars__grid"} x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} />
              <text className="sbars__tick" x={PAD_L - 6} y={yOf(t)} textAnchor="end" dominantBaseline="middle">
                {tick ? tick(t) : t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD_L + slot * i + slot / 2;
            const x = cx - barW / 2;
            const base = yOf(0);
            const h = base - yOf(d.value);
            const isSel = i === sel;
            return (
              <g key={d.start} className={`sbars__bar${isSel ? " is-sel" : ""}`}>
                {isSel && <rect className="sbars__selbg" x={cx - slot / 2} y={PAD_T - 4} width={slot} height={innerH + 4} rx={Math.min(4, slot / 2)} />}
                {h > 0 ? (
                  <path
                    className={d.current ? "sbars__fill sbars__fill--partial" : "sbars__fill"}
                    style={d.current ? { fill: `url(#${uid}-hatch)` } : undefined}
                    d={topRounded(x, base - h, barW, h, R)}
                  />
                ) : (
                  <rect className="sbars__zero" x={x} y={base - 2} width={barW} height={2} />
                )}
              </g>
            );
          })}
          {data.map((d, i) =>
            labelled.has(i) ? (
              <text
                key={`l${d.start}`}
                className={`sbars__tick${d.current ? " sbars__tick--now" : ""}`}
                x={PAD_L + slot * i + slot / 2}
                y={H - 6}
                textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                dx={i === 0 ? -barW / 2 : i === last ? barW / 2 : 0}
              >
                {xLabel(d)}
              </text>
            ) : null,
          )}
          {data.map((d, i) => (
            <rect
              key={`hit${d.start}`}
              className="sbars__hit"
              x={PAD_L + slot * i}
              y={0}
              width={slot}
              height={H}
              onPointerEnter={(e) => e.pointerType === "mouse" && setPicked(i)}
              onClick={() => setPicked(i)}
            />
          ))}
        </svg>
      </div>
      {data[last]!.current && data[last]!.value > 0 && (
        <figcaption className="sbars__legend">
          <svg className="sbars__key" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
            <rect width="10" height="10" rx="2" style={{ fill: `url(#${uid}-hatch)` }} />
          </svg>
          {unit === "week" ? "This week" : "This month"} is still going
        </figcaption>
      )}
      <details className="trend__table sbars__table">
        <summary>Show as table</summary>
        <table>
          <caption className="sr-only">{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{unit === "week" ? "Week" : "Month"}</th>
              <th scope="col">{label}</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.start}>
                <td>{d.current ? (unit === "week" ? "This week" : "This month") : unit === "week" ? fmtShortDate(d.start) : monthFmt.format(d.start)}</td>
                <td>{format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
