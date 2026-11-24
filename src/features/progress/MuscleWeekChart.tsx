// Weekly estimated sets for one muscle: one stacked bar per week, primary (solid record blue) under
// secondary (hatched, already weighted ×0.5). The current week is partial and says so. Tap or hover
// a week for its numbers; arrow keys move between weeks; a table carries the same values.
import { useId, useState, type KeyboardEvent } from "react";
import { SECONDARY_SET_WEIGHT } from "../../shared/domain";
import { fmtSets, type WeekBucket } from "../coverage/muscleStats";
import { niceStep } from "./chart";
import { fmtShortDate } from "./format";

const W = 320;
const H = 148;
const PAD_L = 26;
const PAD_R = 4;
const PAD_T = 10;
const PAD_B = 22;
const GAP = 2; // surface gap between stacked segments
const R = 3; // rounded data end

/** Rect with only the top corners rounded (the data end), anchored to the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

const weekName = (w: WeekBucket, isCurrent: boolean) => (isCurrent ? "This week so far" : `Week of ${fmtShortDate(w.start)}`);

export function MuscleWeekChart({ weeks, muscleLabel }: { weeks: readonly WeekBucket[]; muscleLabel: string }) {
  const uid = "mw" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const last = weeks.length - 1;
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked ?? last;
  const selW = weeks[sel]!;

  const maxV = Math.max(...weeks.map((w) => w.estimated), 0);
  const step = niceStep(Math.max(maxV, 2), 2);
  const top = Math.max(step, Math.ceil(maxV / step) * step);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const slot = innerW / weeks.length;
  const barW = Math.min(22, slot * 0.62);
  const yOf = (v: number) => PAD_T + innerH - (v / top) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);

  const trained = weeks.filter((w) => w.estimated > 0).length;
  const peak = weeks.reduce((a, b) => (b.estimated > a.estimated ? b : a), weeks[0]!);
  const summary =
    trained === 0
      ? `${muscleLabel}: no estimated sets in the last ${weeks.length} weeks.`
      : `${muscleLabel}, estimated sets per week over the last ${weeks.length} weeks. Trained in ${trained} of ${weeks.length} weeks; highest ${fmtSets(peak.estimated)} in the ${weekName(peak, peak === weeks[last]).toLowerCase()}. This week so far: ${fmtSets(weeks[last]!.estimated)}.`;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setPicked(Math.max(0, Math.min(last, sel + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setPicked(e.key === "Home" ? 0 : last);
    }
  };

  return (
    <figure className="mweek">
      <p className="mweek__readout" aria-live="polite">
        <span className="mweek__value num">{fmtSets(selW.estimated)}</span>
        <span className="mweek__when">
          {weekName(selW, sel === last)}
          <span className="mweek__split">
            {selW.primarySets} primary · {selW.secondarySets} secondary
          </span>
        </span>
      </p>
      <div
        className="mweek__plot"
        tabIndex={0}
        role="group"
        aria-label={`${summary} Use left and right arrow keys to read each week.`}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="mweek__svg" aria-hidden="true" focusable="false">
          <defs>
            <pattern id={`${uid}-hatch`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" className="mweek__hatch-bg" />
              <line x1="1" y1="0" x2="1" y2="4" className="mweek__hatch-line" />
            </pattern>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "mweek__base" : "mweek__grid"} x1={PAD_L} x2={W - PAD_R} y1={yOf(t)} y2={yOf(t)} />
              <text className="mweek__tick" x={PAD_L - 6} y={yOf(t)} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = PAD_L + slot * i + slot / 2;
            const x = cx - barW / 2;
            const pV = w.primarySets;
            const sV = w.secondarySets * SECONDARY_SET_WEIGHT;
            const base = yOf(0);
            const pH = base - yOf(pV);
            const sH = base - yOf(pV + sV) - pH;
            const isSel = i === sel;
            return (
              <g key={w.start} className={`mweek__bar${isSel ? " is-sel" : ""}${i === last ? " is-current" : ""}`}>
                {isSel && <rect className="mweek__selbg" x={cx - slot / 2 + 1} y={PAD_T - 4} width={slot - 2} height={innerH + 4} rx={4} />}
                {w.estimated === 0 && <rect className="mweek__zero" x={x} y={base - 2} width={barW} height={2} />}
                {pH > 0 && <path className="mweek__primary" d={topRounded(x, base - pH, barW, pH, sH > 0 ? 0 : R)} />}
                {sH > 0 && (
                  <path
                    className="mweek__secondary"
                    style={{ fill: `url(#${uid}-hatch)` }}
                    d={topRounded(x, base - pH - sH, barW, Math.max(0, sH - (pH > 0 ? GAP : 0)), R)}
                  />
                )}
              </g>
            );
          })}
          {weeks.map((w, i) =>
            i === 0 || i === last || i === Math.floor(last / 2) ? (
              <text
                key={`l${w.start}`}
                className={`mweek__tick${i === last ? " mweek__tick--now" : ""}`}
                x={PAD_L + slot * i + slot / 2}
                y={H - 6}
                textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                dx={i === 0 ? -barW / 2 : i === last ? barW / 2 : 0}
              >
                {i === last ? "This wk" : fmtShortDate(w.start)}
              </text>
            ) : null,
          )}
          {/* Full-height columns: a fingertip-sized target per week. */}
          {weeks.map((w, i) => (
            <rect
              key={`hit${w.start}`}
              className="mweek__hit"
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
      <figcaption className="mweek__legend">
        <span className="mweek__key mweek__key--p" aria-hidden="true" /> Primary
        <svg className="mweek__key-svg" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          <rect width="10" height="10" rx="2" style={{ fill: `url(#${uid}-hatch)` }} />
        </svg>
        Secondary (counts ½)
      </figcaption>
      <details className="trend__table mweek__table">
        <summary>Show as table</summary>
        <table>
          <caption className="sr-only">{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Est. sets</th>
              <th scope="col">Primary</th>
              <th scope="col">Secondary</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w, i) => (
              <tr key={w.start}>
                <td>{i === 0 ? "This week" : fmtShortDate(w.start)}</td>
                <td>{fmtSets(w.estimated)}</td>
                <td>{w.primarySets}</td>
                <td>{w.secondarySets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
