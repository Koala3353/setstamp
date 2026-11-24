import { cx } from "./cx";
import { IconAlert, IconCheck, IconCloudOff, IconDevice, IconSync } from "./icons";

export type SyncState = "offline" | "saved_local" | "syncing" | "synced" | "error";

/** Shape returned by useSyncStatus() (src/sync). The UI only reads it. */
export type SyncStatusValue = {
  state: SyncState;
  /** Writes saved on this device but not yet on the server. */
  pending: number;
  /** Retry after an error. */
  retry?: () => void;
  /** Last error message, for the detail sheet / title. */
  error?: string | null;
};

const COPY: Record<SyncState, { short: string; long: (n: number) => string }> = {
  offline: { short: "Offline", long: (n) => (n ? `Offline. ${n} ${n === 1 ? "change" : "changes"} saved on this device.` : "Offline. Changes save on this device.") },
  saved_local: { short: "Saved on device", long: (n) => `Saved on this device. ${n} ${n === 1 ? "change" : "changes"} waiting to sync.` },
  syncing: { short: "Syncing", long: (n) => (n ? `Syncing ${n} ${n === 1 ? "change" : "changes"}.` : "Syncing.") },
  synced: { short: "Synced", long: () => "All changes synced." },
  error: { short: "Sync failed", long: (n) => `Sync failed. ${n} ${n === 1 ? "change is" : "changes are"} safe on this device. Tap to retry.` },
};

const ICON = {
  offline: IconCloudOff,
  saved_local: IconDevice,
  syncing: IconSync,
  synced: IconCheck,
  error: IconAlert,
} as const;

/**
 * Small, unobtrusive sync indicator for the header. Quiet when synced (icon only),
 * shows a word when something needs attention. Becomes a retry button on error.
 */
export function SyncStatus({ status, className }: { status: SyncStatusValue; className?: string }) {
  const { state, pending, retry } = status;
  const Icon = ICON[state];
  const copy = COPY[state];
  const quiet = state === "synced";
  const body = (
    <>
      <Icon size={18} className={cx(state === "syncing" && "ui-sync__spin")} />
      {!quiet && <span className="ui-sync__text">{copy.short}</span>}
      {pending > 0 && state !== "synced" && <span className="ui-sync__count num">{pending}</span>}
    </>
  );
  const label = copy.long(pending);
  if (state === "error" && retry) {
    return (
      <button type="button" className={cx("ui-sync", `ui-sync--${state}`, className)} onClick={retry} aria-label={label} title={label}>
        {body}
      </button>
    );
  }
  return (
    <span className={cx("ui-sync", `ui-sync--${state}`, className)} role="status" aria-label={label} title={label}>
      {body}
    </span>
  );
}
