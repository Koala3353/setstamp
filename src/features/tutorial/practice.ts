import type { SyncStore } from "../../sync";

/** Tombstone the practice workout and everything in it. */
export async function discardWorkout(store: SyncStore, sessionCid: string): Promise<void> {
  for (const r of store.list("sets")) if (r.data?.sessionCid === sessionCid) await store.remove("sets", r.cid);
  for (const r of store.list("sessionExercises")) if (r.data?.sessionCid === sessionCid) await store.remove("sessionExercises", r.cid);
  await store.remove("sessions", sessionCid);
}
