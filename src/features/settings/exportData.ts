// Building export files. Pure helpers are separate from the browser download so they can be tested.
import { SYNC_TABLES, type SyncOp, type SyncRow } from "../../shared/sync";

export function dateStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The server export plus anything still queued on this device, so a JSON export taken right after
 * an offline workout doesn't silently miss it.
 */
export function withPendingOps<T extends object>(serverExport: T, pending: readonly SyncOp[]) {
  return {
    ...serverExport,
    pendingOnThisDevice: {
      note:
        pending.length === 0
          ? "Nothing was waiting to sync when this export was made."
          : "Changes saved on this device that hadn't reached the server yet. They aren't in `rows` above.",
      ops: pending,
    },
  };
}

/** Offline fallback: this device's own copy of your rows (no account details). */
export function localExport(rows: readonly SyncRow[], pending: readonly SyncOp[], now: number) {
  return {
    format: "gym-app-local/1" as const,
    exportedAt: now,
    note: "Made from this device's copy while the server couldn't be reached. It includes changes not yet synced.",
    rows: [...rows].sort((a, b) => SYNC_TABLES.indexOf(a.table) - SYNC_TABLES.indexOf(b.table) || a.cid.localeCompare(b.cid)),
    pendingOps: pending.length,
  };
}

/** Save text as a file through a temporary link. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
