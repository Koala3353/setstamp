// Client-side CSV of every logged set, built from the local store so it works offline.
// Weights are written as entered (value + unit), never re-converted, so 45 lb stays 45 lb.
import type { SessionData, SessionExerciseData, SetData } from "../../shared/sync";

type Row<T> = { cid: string; data: T | null };

export const CSV_HEADER = [
  "date",
  "workout",
  "exercise",
  "set_kind",
  "weight",
  "unit",
  "reps",
  "assist_kg",
  "duration_sec",
  "rpe",
  "notes",
] as const;

/**
 * RFC 4180 field: quoted when it contains a comma, quote, CR or LF; quotes doubled.
 * Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start) gets a
 * leading apostrophe. Numbers are passed as numbers and never prefixed.
 */
export function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Number(v.toFixed(4))) : "";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(fields: ReadonlyArray<string | number | null | undefined>): string {
  return fields.map(csvField).join(",");
}

/** "2026-11-24 18:05" in local time. */
export function localStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * One row per done set (planned-but-not-done sets are left out), ordered by workout start, then
 * exercise order, then set order. `notes` is the exercise note from that workout.
 */
export function buildSetsCsv(
  input: {
    sessions: readonly Row<SessionData>[];
    sessionExercises: readonly Row<SessionExerciseData>[];
    sets: readonly Row<SetData>[];
  },
  nameOf: (exId: string) => string,
): string {
  const sessions = new Map<string, SessionData>();
  for (const r of input.sessions) if (r.data) sessions.set(r.cid, r.data);
  const sx = new Map<string, SessionExerciseData>();
  for (const r of input.sessionExercises) if (r.data) sx.set(r.cid, r.data);

  const rows = input.sets
    .map((r) => r.data)
    .filter((s): s is SetData => !!s && s.done)
    .map((s) => {
      const sess = sessions.get(s.sessionCid);
      const ex = sx.get(s.sessionExerciseCid);
      return { s, sess, ex, start: sess?.startedAt ?? s.completedAt ?? 0 };
    })
    .sort((a, b) => a.start - b.start || (a.ex?.order ?? 0) - (b.ex?.order ?? 0) || a.s.order - b.s.order);

  const lines = [CSV_HEADER.join(",")];
  for (const { s, sess, ex, start } of rows) {
    const weight = s.entered ? s.entered.value : s.weightKg;
    const unit = s.entered ? s.entered.unit : s.weightKg !== null ? "kg" : null;
    lines.push(
      csvLine([
        localStamp(s.completedAt ?? start),
        sess?.name ?? "",
        nameOf(s.exId),
        s.kind,
        weight,
        unit,
        s.reps,
        s.assistKg,
        s.durationSec,
        s.rpe,
        ex?.notes || null,
      ]),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
