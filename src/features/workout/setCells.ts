// What a set row shows for each tracking type: one or two stamped values, plus the words a
// screen reader hears ("20 kg, 45 seconds" rather than "20×45").
import type { Tracking, Unit } from "../../shared/domain";
import type { SetData } from "../../shared/sync";
import { displayWeight, fmtNum, kgToDisplay } from "../../logic/units";

export type Cell = { kind: "load" | "assist" | "reps" | "time" | "distance"; main: string; sub: string };

type SetLike = Pick<SetData, "weightKg" | "entered" | "reps" | "assistKg" | "durationSec" | "distanceM">;

const load = (s: SetLike, unit: Unit): Cell => ({ kind: "load", main: fmtNum(displayWeight(s, unit)), sub: unit });
const reps = (s: SetLike): Cell => ({ kind: "reps", main: s.reps === null ? "–" : String(s.reps), sub: "reps" });
const time = (s: SetLike): Cell => ({ kind: "time", main: s.durationSec === null ? "–" : String(s.durationSec), sub: "s" });
const dist = (s: SetLike): Cell => ({ kind: "distance", main: s.distanceM === null ? "–" : fmtNum(s.distanceM), sub: "m" });

export function setCells(s: SetLike, t: Tracking, unit: Unit): Cell[] {
  switch (t) {
    case "weight_reps":
      return [load(s, unit), reps(s)];
    case "bodyweight_reps": {
      const w = displayWeight(s, unit);
      return [w ? { kind: "load", main: `+${fmtNum(w)}`, sub: unit } : { kind: "load", main: "BW", sub: "" }, reps(s)];
    }
    case "assisted_reps":
      return [{ kind: "assist", main: s.assistKg === null ? "–" : `−${fmtNum(kgToDisplay(s.assistKg, unit))}`, sub: `${unit} assist` }, reps(s)];
    case "duration":
      return [time(s)];
    case "weight_duration":
      return [load(s, unit), time(s)];
    case "distance_time":
      return s.distanceM === null ? [time(s)] : [dist(s), time(s)];
    case "weight_distance":
      return [load(s, unit), dist(s)];
  }
}

function spokenCell(c: Cell): string {
  const none = c.main === "–";
  switch (c.kind) {
    case "load":
      return none ? "no weight yet" : c.main === "BW" ? "bodyweight" : `${c.main} ${c.sub}`;
    case "assist":
      return none ? "no assistance set" : `${c.main} ${c.sub}`;
    case "reps":
      return none ? "no reps" : c.main === "1" ? "1 rep" : `${c.main} reps`;
    case "time":
      return none ? "no time yet" : `${c.main} seconds`;
    case "distance":
      return none ? "no distance yet" : `${c.main} metres`;
  }
}

/** "135 lb, 8 reps", "20 kg, 45 seconds", "40 kg, 30 metres". */
export const spokenSet = (cells: readonly Cell[]) => cells.map(spokenCell).join(", ");
