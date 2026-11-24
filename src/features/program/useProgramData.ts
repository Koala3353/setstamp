// Data hooks for the program and coverage UI: exercise info (catalog + custom), programs,
// and write helpers. All writes go to the local store; the outbox syncs them.
import { useCallback, useEffect, useMemo } from "react";
import type { ProgramData } from "../../shared/sync";
import { useCatalog, useRows, useSyncStore } from "../../sync/react";
import type { LocalRow } from "../../sync";
import type { ExerciseInfo, ExerciseLookup } from "../coverage/coverage";
import { useUserSettings } from "../session/hooks";
import { reconcileCompletions } from "./schedule";

export type ExerciseIndex = { list: readonly ExerciseInfo[]; lookup: ExerciseLookup };

/** Every exercise the user can plan with: active catalog rows plus their custom exercises. */
export function useExerciseIndex(): ExerciseIndex {
  const catalog = useCatalog();
  const custom = useRows("customExercises");
  return useMemo(() => {
    const list: ExerciseInfo[] = [];
    const map = new Map<string, ExerciseInfo>();
    for (const e of catalog) {
      const info: ExerciseInfo = {
        exId: e.exId,
        name: e.name,
        primary: e.primary,
        secondary: e.secondary,
        pattern: e.pattern,
        equipment: e.equipment,
        tracking: e.tracking,
        commonness: e.commonness,
        mechanic: e.mechanic,
        family: e.family,
        status: e.status,
      };
      map.set(e.exId, info);
      if (e.status === "active") list.push(info);
    }
    for (const r of custom) {
      const d = r.data;
      if (!d) continue;
      const info: ExerciseInfo = {
        exId: d.exId,
        name: d.name,
        primary: d.primary,
        secondary: d.secondary,
        pattern: d.pattern,
        equipment: d.equipment,
        tracking: d.tracking,
        commonness: 3,
        mechanic: null,
        family: null,
        status: "active",
      };
      map.set(d.exId, info);
      list.push(info);
    }
    const lookup: ExerciseLookup = (exId) => {
      const hit = map.get(exId);
      // Merged catalog rows stay resolvable through `mergedInto`.
      if (hit?.status === "merged") {
        const row = catalog.find((c) => c.exId === exId);
        if (row?.mergedInto) return map.get(row.mergedInto) ?? hit;
      }
      return hit;
    };
    return { list, lookup };
  }, [catalog, custom]);
}

export type ProgramRow = LocalRow<"programs"> & { data: ProgramData };

export function usePrograms(): { all: ProgramRow[]; active: ProgramRow | null } {
  const rows = useRows("programs");
  const settings = useUserSettings();
  return useMemo(() => {
    const all = rows.filter((r): r is ProgramRow => !!r.data && !r.data.archived);
    const active = all.find((r) => r.cid === settings.activeProgramCid) ?? null;
    return { all, active };
  }, [rows, settings.activeProgramCid]);
}

export function useWriteProgram(): (cid: string, data: ProgramData) => Promise<void> {
  const store = useSyncStore();
  return useCallback(
    async (cid: string, data: ProgramData) => {
      if (store) await store.write("programs", cid, data);
    },
    [store],
  );
}

/**
 * Log finished sessions of this program that the schedule doesn't know about yet (e.g. finished
 * on another device). Idempotent per sessionCid, so it never double-advances.
 */
export function useReconcileCompletions(program: ProgramRow | null): void {
  const sessions = useRows("sessions");
  const write = useWriteProgram();
  useEffect(() => {
    if (!program) return;
    const next = reconcileCompletions(
      program.cid,
      program.data,
      sessions.filter((s) => s.data).map((s) => ({ cid: s.cid, data: s.data! })),
    );
    if (next !== program.data) void write(program.cid, next);
  }, [program, sessions, write]);
}
