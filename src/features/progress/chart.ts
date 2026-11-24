// Geometry for the hand-rolled trend chart: points only, no smoothing, no interpolation.

export type ChartBox = {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
};

export type PlottedPoint = { x: number; y: number; value: number; at: number };

export type ChartLayout = {
  points: PlottedPoint[];
  yTicks: Array<{ y: number; value: number }>;
  xLabels: Array<{ x: number; at: number }>;
  min: number;
  max: number;
};

/** A "nice" step (1, 2, 2.5, 5 × 10^n) so axis labels read cleanly. */
export function niceStep(range: number, ticks: number): number {
  if (!(range > 0)) return 1;
  const raw = range / Math.max(1, ticks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag;
  return 10 * mag;
}

/**
 * Lay out (at, value) pairs in a box. X spaces points by time; equal times (or a single point)
 * are centred. The Y axis spans nice ticks around the data and never pretends a flat line is a trend.
 */
export function layoutChart(data: ReadonlyArray<{ at: number; value: number }>, box: ChartBox, ticks = 4): ChartLayout {
  const innerW = box.width - box.padL - box.padR;
  const innerH = box.height - box.padT - box.padB;
  if (data.length === 0) return { points: [], yTicks: [], xLabels: [], min: 0, max: 0 };

  const values = data.map((d) => d.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, ticks);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;

  const t0 = Math.min(...data.map((d) => d.at));
  const t1 = Math.max(...data.map((d) => d.at));
  const xOf = (at: number) => box.padL + (t1 === t0 ? innerW / 2 : ((at - t0) / (t1 - t0)) * innerW);
  const yOf = (v: number) => box.padT + innerH - ((v - min) / (max - min)) * innerH;

  const points = data.map((d) => ({
    x: xOf(d.at),
    y: yOf(d.value),
    value: d.value,
    at: d.at,
  }));
  const yTicks: ChartLayout["yTicks"] = [];
  for (let v = min; v <= max + step / 1000; v += step) yTicks.push({ y: yOf(v), value: Number(v.toFixed(4)) });
  const xLabels =
    t1 === t0
      ? [{ x: xOf(t0), at: t0 }]
      : [
          { x: xOf(t0), at: t0 },
          { x: xOf(t1), at: t1 },
        ];
  return { points, yTicks, xLabels, min, max };
}
