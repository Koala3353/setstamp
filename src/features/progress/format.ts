// Display helpers for Progress. Loads are stored in kg and shown in the user's unit; a set typed
// in that unit shows exactly as typed.
import type { Unit } from "../../shared/domain";
import { displayWeight, fmtInt, fmtNum, kgToDisplay } from "../../logic/units";
import type { SetData } from "../../shared/sync";
import type { PrCard, TrendMetric } from "./model";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const dateYearFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

/** "Tue 24 Nov" this year, "24 Nov 2025" otherwise. */
export function fmtDate(ms: number, now = Date.now()): string {
  return new Date(ms).getFullYear() === new Date(now).getFullYear() ? dateFmt.format(ms) : dateYearFmt.format(ms);
}
export const fmtShortDate = (ms: number) => shortFmt.format(ms);

/** 3720 -> "1 h 2 min", 1500 -> "25 min". */
export function fmtMinutes(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export const fmtLoad = (kg: number, unit: Unit) => `${fmtNum(kgToDisplay(kg, unit))} ${unit}`;

/** Volume load rounded to whole units with thousands separators: "12,450 kg". */
export function fmtVolume(kg: number, unit: Unit): string {
  const v = kgToDisplay(kg, unit) ?? 0;
  return `${fmtInt(v)} ${unit}`;
}

export function fmtSet(s: SetData, unit: Unit): string {
  const parts: string[] = [];
  const w = displayWeight(s, unit);
  if (s.assistKg !== null) parts.push(`${fmtNum(kgToDisplay(s.assistKg, unit))} ${unit} assist`);
  else if (w !== null && w > 0) parts.push(`${fmtNum(w)} ${unit}`);
  if (s.reps !== null) parts.push(`${s.reps} reps`);
  if (s.durationSec !== null) parts.push(`${s.durationSec} s`);
  if (s.distanceM !== null) parts.push(`${fmtNum(s.distanceM)} m`);
  const main = parts.join(" × ") || "–";
  return s.rpe !== null ? `${main} · RPE ${fmtNum(s.rpe)}` : main;
}

export const KIND_LABEL: Record<SetData["kind"], string> = {
  warmup: "Warm-up",
  working: "Working",
  drop: "Drop",
  failure: "To failure",
};

export const METRIC_LABEL: Record<TrendMetric, string> = {
  top: "Top set",
  e1rm: "Est. 1RM",
  reps: "Most reps",
  assist: "Assistance",
  hold: "Longest hold",
  load: "Heaviest load",
  carry: "Load × distance",
};

export const METRIC_DESCRIPTION: Record<TrendMetric, string> = {
  top: "Heaviest working set each session.",
  e1rm: "Best estimated 1RM each session (Epley, sets of 10 reps or fewer). An estimate, not a tested max.",
  reps: "Most reps in one working set each session.",
  assist: "Least assistance in one working set each session. Lower means less help.",
  hold: "Longest working hold each session.",
  load: "Heaviest load held or carried in one working set each session, whatever the time or distance.",
  carry: "Best load × distance in one working set each session (kg·m or lb·m). Not comparable with lifting volume.",
};

/** Value of a trend point in display units ("102.5 kg", "12 reps", "45 s"). */
export function fmtMetric(metric: TrendMetric, value: number, unit: Unit): string {
  if (metric === "reps") return `${value} reps`;
  if (metric === "hold") return `${value} s`;
  if (metric === "carry") return `${fmtInt(kgToDisplay(value, unit) ?? 0)} ${unit}·m`;
  return fmtLoad(value, unit);
}

/** Axis value in display units, without the unit. */
export function metricAxisValue(metric: TrendMetric, value: number, unit: Unit): number {
  return metric === "reps" || metric === "hold" ? value : (kgToDisplay(value, unit) ?? value);
}

export function prTitle(c: PrCard, unit: Unit = "kg"): string {
  switch (c.kind) {
    case "weight_at_reps":
      return c.reps === 1 ? "Heaviest single" : `Heaviest for ${c.reps} reps`;
    case "e1rm":
      return "Best est. 1RM";
    case "most_reps":
      return "Most reps, one set";
    case "least_assist":
      return `Least assistance, ${c.reps} reps`;
    case "longest_duration":
      return "Longest hold";
    case "session_volume":
      return "Best session volume";
    case "longest_at_load":
      return `Longest hold at ${fmtLoad(c.kg, unit)}`;
    case "heaviest_hold":
      return `Heaviest hold, ${c.sec} s`;
    case "load_distance":
      return "Best load × distance";
  }
}

export function prValue(c: PrCard, unit: Unit): { value: string; unit: string } {
  switch (c.kind) {
    case "weight_at_reps":
    case "least_assist":
    case "e1rm":
      return { value: fmtNum(kgToDisplay(c.kg, unit)), unit };
    case "session_volume":
      return { value: fmtInt(kgToDisplay(c.kg, unit) ?? 0), unit };
    case "most_reps":
      return { value: String(c.reps), unit: "reps" };
    case "longest_duration":
    case "longest_at_load":
      return { value: String(c.sec), unit: "s" };
    case "heaviest_hold":
      return { value: fmtNum(kgToDisplay(c.kg, unit)), unit };
    case "load_distance":
      return { value: fmtInt(kgToDisplay(c.kg * c.m, unit) ?? 0), unit: `${unit}·m` };
  }
}
