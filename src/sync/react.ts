import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { CatalogExercise } from "../shared/domain";
import type { SyncTable } from "../shared/sync";
import type { SyncStore } from "./store";
import type { FailedOp, LocalRow, SyncStatus } from "./types";

const SyncContext = createContext<SyncStore | null>(null);

/** Provide the signed-in user's store (or null while signed out). Re-key children on user switch. */
export function SyncProvider({ store, children }: { store: SyncStore | null; children?: ReactNode }) {
  return createElement(SyncContext.Provider, { value: store }, children);
}

export function useSyncStore(): SyncStore | null {
  return useContext(SyncContext);
}

const noopSubscribe = () => () => {};
const EMPTY_ROWS: readonly never[] = Object.freeze([]);
const EMPTY_CATALOG: readonly CatalogExercise[] = Object.freeze([]);
const SIGNED_OUT: SyncStatus = Object.freeze({ state: "offline", pending: 0, failed: 0, lastSyncAt: null, lastError: null });

/** Live (non-deleted) rows of a table. Pass a stable `filter` (useCallback) to avoid re-filtering. */
export function useRows<T extends SyncTable>(
  table: T,
  filter?: (row: LocalRow<T>) => boolean,
): readonly LocalRow<T>[] {
  const store = useSyncStore();
  const rows = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? store.list(table) : (EMPTY_ROWS as readonly LocalRow<T>[])),
  );
  return useMemo(() => (filter ? rows.filter(filter) : rows), [rows, filter]);
}

export function useRow<T extends SyncTable>(table: T, cid: string | null | undefined): LocalRow<T> | undefined {
  const store = useSyncStore();
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, () =>
    store && cid ? store.get(table, cid) : undefined,
  );
}

export function useSyncStatus(): SyncStatus {
  const store = useSyncStore();
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, () => (store ? store.getStatus() : SIGNED_OUT));
}

export function useCatalog(): readonly CatalogExercise[] {
  const store = useSyncStore();
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, () =>
    store ? store.getCatalog() : EMPTY_CATALOG,
  );
}

let failedCache: { store: SyncStore; status: SyncStatus; list: readonly FailedOp[] } | null = null;

/** Ops the server rejected (validation). Show them with retry/discard actions. */
export function useFailedOps(): readonly FailedOp[] {
  const store = useSyncStore();
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, () => {
    if (!store) return EMPTY_ROWS;
    const status = store.getStatus();
    if (!failedCache || failedCache.store !== store || failedCache.status !== status) {
      failedCache = { store, status, list: store.getFailed() };
    }
    return failedCache.list;
  });
}
