// Hand-rolled SVG trend: one point per session, no connecting or smoothed line, so gaps between
// sessions are never drawn as if they were measured. The best point is marked in iron (a record).
// A plain table carries the same numbers for screen readers and anyone who prefers it.
import { useId, useMemo, useState } from "react";
import type { Unit } from "../../shared/domain";
import { fmtNum } from "../../logic/units";
import { layoutChart, type ChartBox } from "./chart";
import { fmtDate, fmtMetric, fmtShortDate, METRIC_LABEL, metricAxisValue } from "./format";
import type { TrendMetric, TrendPoint } from "./model";

const BOX: ChartBox = {
  width: 400,
  height: 220,
  padL: 50,
  padR: 16,
  padT: 18,
  padB: 32,
};

export function TrendChart({ points, metric, unit }: { points: readonly TrendPoint[]; metric: TrendMetric; unit: Unit }) {
  const titleId = useId();
  const data = useMemo(
    () =>
      points.map((p) => ({
        at: p.at,
        value: metricAxisValue(metric, p.value, unit),
      })),
    [points, metric, unit],
  );
  const layout = useMemo(() => layoutChart(data, BOX), [data]);
  const lowerIsBetter = metric === "assist";
  const bestIdx = useMemo(() => {
    let b = -1;
    points.forEach((p, i) => {
      if (b < 0 || (lowerIsBetter ? p.value < points[b]!.value : p.value > points[b]!.value)) b = i;
    });
    return b;
  }, [points, lowerIsBetter]);

  // Tapped point for the readout; defaults to the latest session. Phones have no hover.
  const [picked, setPicked] = useState<number | null>(null);
  if (points.length === 0) return null;
  const sel = picked !== null && picked < points.length ? picked : points.length - 1;
  const selPt = points[sel]!;
  const selXY = layout.points[sel]!;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const summary =
    points.length === 1
      ? `${METRIC_LABEL[metric]}: one session, ${fmtMetric(metric, first.value, unit)} on ${fmtDate(first.at)}.`
      : `${METRIC_LABEL[metric]} over ${points.length} sessions, from ${fmtMetric(metric, first.value, unit)} on ${fmtDate(first.at)} to ${fmtMetric(metric, last.value, unit)} on ${fmtDate(last.at)}.`;
  const axisUnit = metric === "reps" ? "reps" : metric === "hold" ? "s" : unit;

  return (
    <figure className="trend">
      <p className="trend__readout">
        <span className="trend__value num">{fmtMetric(metric, selPt.value, unit)}</span>
        <span className="trend__when">
          {fmtDate(selPt.at)}
          {sel === bestIdx && points.length > 1 && <span className="trend__best"> · best session</span>}
        </span>
      </p>
      <svg className="trend__svg" viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{summary}</title>
        {layout.yTicks.map((t) => (
          <g key={t.value}>
            <line className="trend__grid" x1={BOX.padL} x2={BOX.width - BOX.padR} y1={t.y} y2={t.y} />
            <text className="trend__tick" x={BOX.padL - 6} y={t.y} textAnchor="end" dominantBaseline="middle">
              {fmtNum(t.value)}
            </text>
          </g>
        ))}
        <text className="trend__tick" x={4} y={BOX.padT - 4} dominantBaseline="auto">
          {axisUnit}
        </text>
        {layout.xLabels.map((l, i) => (
          <text
            key={l.at}
            className="trend__tick"
            x={l.x}
            y={BOX.height - 8}
            textAnchor={layout.xLabels.length === 1 ? "middle" : i === 0 ? "start" : "end"}
          >
            {fmtShortDate(l.at)}
          </text>
        ))}
        <line className="trend__guide" x1={selXY.x} x2={selXY.x} y1={BOX.padT} y2={BOX.height - BOX.padB} />
        {layout.points.map((p, i) => (
          <circle
            key={points[i]!.sessionCid}
            className={`trend__pt${i === bestIdx ? " trend__pt--best" : ""}${i === sel ? " is-sel" : ""}`}
            cx={p.x}
            cy={p.y}
            r={i === sel ? 6.5 : i === bestIdx ? 5.5 : 4.5}
          />
        ))}
        {/* Generous invisible hit targets: a fingertip, not a 9px dot. */}
        {layout.points.map((p, i) => (
          <circle
            key={`hit-${points[i]!.sessionCid}`}
            className="trend__hit"
            cx={p.x}
            cy={p.y}
            r={18}
            onPointerEnter={(e) => e.pointerType === "mouse" && setPicked(i)}
            onClick={() => setPicked(i)}
          />
        ))}
      </svg>
      <figcaption className="trend__caption">
        <span className="trend__key" aria-hidden="true" /> Best session · one dot per session, tap for its value
        {points.length < 3 && <span> · A trend needs a few more sessions.</span>}
      </figcaption>
      <details className="trend__table">
        <summary>Show as table</summary>
        <table>
          <caption className="sr-only">{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{METRIC_LABEL[metric]}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.sessionCid}>
                <td>{fmtDate(p.at)}</td>
                <td>{fmtMetric(metric, p.value, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
