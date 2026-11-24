// Adapter from the signed-in user's SyncStore status to the shell's SyncStatusValue.
import { useMemo } from "react";
import { useSyncStatus, useSyncStore } from "../sync/react";
import { openSyncIssues } from "../features/session/SyncIssues";
import type { SyncStatusValue } from "../ui/SyncStatus";

export function useShellSyncStatus(): SyncStatusValue {
  const store = useSyncStore();
  const status = useSyncStatus();
  return useMemo<SyncStatusValue>(
    () => ({
      state: status.state,
      // Rejected changes are still only on this device, so count them as unsynced.
      pending: status.pending + status.failed,
      error: status.failed
        ? `${status.failed} ${status.failed === 1 ? "change was" : "changes were"} rejected by the server`
        : status.lastError,
      // Rejected ops need a decision (retry/discard), so show them; otherwise just try again now.
      retry: () => (status.failed > 0 ? openSyncIssues() : store?.kick()),
    }),
    [status, store],
  );
}
