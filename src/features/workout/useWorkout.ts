// Resolves the session in progress from the store, consuming useActiveWorkout() without owning it.
import { useEffect, useMemo } from "react";
import { useActiveWorkout } from "../../app/activeWorkout";
import type { SessionData } from "../../shared/sync";
import { useRows, useSyncStore } from "../../sync/react";

export type OpenSession = { cid: string; data: SessionData };

/**
 * The open session: the provider's session if its row exists, else the newest row with no endedAt.
 * If the provider knows a session the store has no row for yet, the row is created here.
 */
export function useOpenSession(): OpenSession | null {
  const { session } = useActiveWorkout();
  const store = useSyncStore();
  const sessions = useRows("sessions");
  const resolved = useMemo<OpenSession | null>(() => {
    const open = sessions.filter((r) => r.data && r.data.endedAt === null).sort((a, b) => b.data!.startedAt - a.data!.startedAt);
    const byCtx = session ? sessions.find((r) => r.cid === session.cid && r.data) : undefined;
    if (byCtx?.data) return byCtx.data.endedAt === null ? { cid: byCtx.cid, data: byCtx.data } : null;
    const first = open[0];
    return first?.data ? { cid: first.cid, data: first.data } : null;
  }, [sessions, session]);

  const missing = Boolean(session && store && !resolved && !sessions.some((r) => r.cid === session.cid));
  useEffect(() => {
    if (!missing || !session || !store) return;
    void store.write("sessions", session.cid, { startedAt: session.startedAt, endedAt: null, name: session.name, programCid: null, dayId: null, notes: "", bodyweightKg: null });
  }, [missing, session, store]);

  return resolved;
}
