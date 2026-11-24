// Changes the server rejected (validation failures). Opened from the header sync indicator.
import { useSyncExternalStore } from "react";
import { Button, ListGroup, ListRow, Sheet } from "../../ui";
import { useFailedOps, useSyncStatus, useSyncStore } from "../../sync/react";
import "./session.css";

let open = false;
const listeners = new Set<() => void>();
function setOpen(v: boolean) {
  open = v;
  for (const l of listeners) l();
}
export function openSyncIssues() {
  setOpen(true);
}
function useOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}

const TABLE_LABEL: Record<string, string> = {
  settings: "Settings",
  favorites: "Favorite",
  customExercises: "Custom exercise",
  programs: "Program",
  sessions: "Workout",
  sessionExercises: "Workout exercise",
  sets: "Set",
};

export function SyncIssuesSheet() {
  const isOpen = useOpen();
  const store = useSyncStore();
  const failed = useFailedOps();
  const status = useSyncStatus();
  const close = () => setOpen(false);

  return (
    <Sheet
      open={isOpen}
      onClose={close}
      title="Sync problems"
      description={
        failed.length
          ? `${failed.length} ${failed.length === 1 ? "change was" : "changes were"} turned down by the server. They're still on this device.`
          : status.lastError
            ? `Last sync attempt failed: ${status.lastError}`
            : "Nothing is stuck. Everything on this device has synced or is queued."
      }
      footer={
        <div className="sheet-actions">
          <Button onClick={close}>Close</Button>
          <Button
            variant="primary"
            onClick={() => {
              store?.kick();
              if (!failed.length) close();
            }}
          >
            Sync now
          </Button>
        </div>
      }
    >
      {failed.length > 0 && (
        <ListGroup label="Rejected changes">
          {failed.map((f) => (
            <li key={f.opId}>
              <ListRow
                title={`${TABLE_LABEL[f.op.table] ?? f.op.table}${f.op.deleted ? " (delete)" : ""}`}
                meta={f.reason}
                trailing={
                  <span className="syncissue__actions">
                    <Button size="md" onClick={() => void store?.retryFailed(f.opId)}>
                      Retry
                    </Button>
                    <Button size="md" variant="ghost" onClick={() => void store?.discardFailed(f.opId)}>
                      Discard
                    </Button>
                  </span>
                }
              />
            </li>
          ))}
        </ListGroup>
      )}
    </Sheet>
  );
}
