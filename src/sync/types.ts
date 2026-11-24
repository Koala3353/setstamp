// Device-side sync types. Wire types (SyncOp, SyncRow, PushResult, ChangesResult) come from the
// shared protocol contract in src/shared/sync.ts; everything here is local bookkeeping.

import type { CatalogExercise } from "../shared/domain";
import type { ChangesResult, PushResult, SyncDataMap, SyncOp, SyncRow, SyncTable } from "../shared/sync";

/** A row as held on the device: the server shape plus a `dirty` flag (local edit not yet acknowledged). */
export type LocalRow<T extends SyncTable = SyncTable> = SyncRow<T> & { dirty: boolean };

export type OutboxEntry = {
  opId: string;
  table: SyncTable;
  cid: string;
  op: SyncOp;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
};

export type FailedOp = { opId: string; op: SyncOp; reason: string; at: number };

export type SyncMeta = { lastSeq: number; lastSyncAt: number | null; catalogVersion: string | null };

export type CatalogMeta = { version: string } | string | null;
export type CatalogPage = { page: CatalogExercise[]; isDone: boolean; continueCursor: string };

/**
 * Everything the store needs from the backend. `createConvexTransport` implements it against
 * api.sync.* / api.catalog.*; tests use an in-memory fake with the same semantics.
 * Any thrown error is treated as transient (network/auth) and retried with backoff.
 */
export interface SyncTransport {
  push(ops: SyncOp[]): Promise<PushResult>;
  changes(since: number, limit?: number): Promise<ChangesResult>;
  /** Optional live subscription: call `onChange` whenever changes after `since` may exist. */
  subscribe?(since: number, onChange: () => void): () => void;
  catalogMeta(): Promise<CatalogMeta>;
  catalogPage(cursor: string | null, numItems: number): Promise<CatalogPage>;
  /**
   * Optional: false while the backend connection is down (the browser can still claim to be online,
   * e.g. dead gym Wi-Fi). Lets the status say "Offline, saved on device" instead of "Syncing" forever.
   */
  isConnected?(): boolean;
  /** Optional: call `cb` whenever `isConnected()` may have changed. Returns an unsubscribe. */
  onConnectionChange?(cb: () => void): () => void;
}

export type SyncState = "offline" | "saved_local" | "syncing" | "synced" | "error";

export type SyncStatus = {
  state: SyncState;
  pending: number;
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
};

export type RowData<T extends SyncTable> = SyncDataMap[T];
