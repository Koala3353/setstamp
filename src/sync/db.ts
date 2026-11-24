import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CatalogExercise } from "../shared/domain";
import type { SyncTable } from "../shared/sync";
import type { FailedOp, LocalRow, OutboxEntry, SyncMeta } from "./types";

export interface SyncDBSchema extends DBSchema {
  rows: { key: [SyncTable, string]; value: LocalRow };
  outbox: { key: string; value: OutboxEntry; indexes: { row: [SyncTable, string]; createdAt: number } };
  failed: { key: string; value: FailedOp };
  meta: { key: "meta"; value: SyncMeta };
  catalog: { key: string; value: CatalogExercise };
}

export type SyncDB = IDBPDatabase<SyncDBSchema>;

const DB_PREFIX = "gym-sync-v1:";
const DB_VERSION = 1;

/** One database per signed-in user, so rows never leak between accounts on a shared device. */
export function dbNameFor(userKey: string): string {
  if (!userKey) throw new Error("userKey required");
  return DB_PREFIX + encodeURIComponent(userKey);
}

export function openSyncDB(userKey: string, onBlocking: () => void): Promise<SyncDB> {
  return openDB<SyncDBSchema>(dbNameFor(userKey), DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("rows", { keyPath: ["table", "cid"] });
      const outbox = db.createObjectStore("outbox", { keyPath: "opId" });
      outbox.createIndex("row", ["table", "cid"]);
      outbox.createIndex("createdAt", "createdAt");
      db.createObjectStore("failed", { keyPath: "opId" });
      db.createObjectStore("meta");
      db.createObjectStore("catalog", { keyPath: "exId" });
    },
    // Another connection (e.g. wipeLocalUser) wants to delete/upgrade: get out of its way.
    blocking: onBlocking,
  });
}

export function deleteSyncDB(userKey: string): Promise<void> {
  return deleteDB(dbNameFor(userKey));
}
