// Active workout = the most recent `sessions` row with endedAt === null in the user's SyncStore.
// Shape kept stable for the shell and screens: { session, start, finish } from useActiveWorkout().
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { SessionData } from "../shared/sync";
import { newCid } from "../sync";
import { useRows, useSyncStore } from "../sync/react";
import type { LocalRow } from "../sync";

export type ActiveSession = {
  cid: string;
  name: string;
  startedAt: number;
  /** Working sets marked done so far. */
  setsDone: number;
};

type Ctx = {
  session: ActiveSession | null;
  /** Start a workout; returns the new session cid. Extra fields (programCid, dayId…) are optional. */
  start: (name: string, extra?: Partial<Omit<SessionData, "name" | "startedAt" | "endedAt">>) => string;
  finish: () => void;
};

const ActiveWorkoutContext = createContext<Ctx | null>(null);

const isOpen = (r: LocalRow<"sessions">) => !r.deleted && r.data !== null && r.data.endedAt === null;

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const store = useSyncStore();
  const open = useRows("sessions", isOpen);
  const current = useMemo(() => {
    let best: LocalRow<"sessions"> | null = null;
    for (const r of open) if (!best || r.data!.startedAt > best.data!.startedAt) best = r;
    return best;
  }, [open]);
  const cid = current?.cid ?? null;
  const countDone = useCallback(
    (r: LocalRow<"sets">) => !r.deleted && r.data !== null && r.data.sessionCid === cid && r.data.done && r.data.kind !== "warmup",
    [cid],
  );
  const doneSets = useRows("sets", countDone);

  const session = useMemo<ActiveSession | null>(
    () => (current && current.data ? { cid: current.cid, name: current.data.name, startedAt: current.data.startedAt, setsDone: doneSets.length } : null),
    [current, doneSets.length],
  );

  const start = useCallback<Ctx["start"]>(
    (name, extra) => {
      const id = newCid();
      if (!store) return id;
      const data: SessionData = {
        programCid: null,
        dayId: null,
        notes: "",
        bodyweightKg: null,
        ...extra,
        name,
        startedAt: Date.now(),
        endedAt: null,
      };
      void store.write("sessions", id, data);
      return id;
    },
    [store],
  );

  const finish = useCallback(() => {
    if (!store || !current?.data) return;
    void store.write("sessions", current.cid, { ...current.data, endedAt: Date.now() });
  }, [store, current]);

  const value = useMemo(() => ({ session, start, finish }), [session, start, finish]);
  return <ActiveWorkoutContext.Provider value={value}>{children}</ActiveWorkoutContext.Provider>;
}

export function useActiveWorkout(): Ctx {
  const ctx = useContext(ActiveWorkoutContext);
  if (!ctx) throw new Error("useActiveWorkout must be used inside <ActiveWorkoutProvider>");
  return ctx;
}
