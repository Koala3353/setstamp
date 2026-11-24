// Name / tracking / equipment for any exId: shared catalog first, then the user's custom exercises.
import { useMemo } from "react";
import type { Equipment, Muscle, Tracking } from "../../shared/domain";
import { useCatalog, useRows } from "../../sync/react";

export type ExInfo = { exId: string; name: string; tracking: Tracking; equipment: Equipment[]; primary: Muscle[] };

export type ExLookup = (exId: string) => ExInfo;

const pretty = (exId: string) =>
  exId
    .replace(/^(ex|cx)_/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

export function useExerciseLookup(): ExLookup {
  const catalog = useCatalog();
  const custom = useRows("customExercises");
  return useMemo(() => {
    const map = new Map<string, ExInfo>();
    for (const e of catalog) map.set(e.exId, { exId: e.exId, name: e.name, tracking: e.tracking, equipment: e.equipment, primary: e.primary });
    for (const r of custom) {
      const d = r.data;
      if (d) map.set(d.exId, { exId: d.exId, name: d.name, tracking: d.tracking, equipment: d.equipment, primary: d.primary });
    }
    return (exId: string) => map.get(exId) ?? { exId, name: pretty(exId), tracking: "weight_reps", equipment: [], primary: [] };
  }, [catalog, custom]);
}

export const isBarbell = (eq: readonly Equipment[]) => eq.some((e) => e === "barbell" || e === "ez_bar" || e === "trap_bar" || e === "smith");
