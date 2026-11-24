// Local-first store + durable outbox. IndexedDB is the UI's source of truth; an in-memory mirror
// gives synchronous snapshots for React. Every mutation of the store (local writes, server merges,
// push acknowledgements, catalog swaps) runs through one async mutex, so the memory mirror and
// IndexedDB always change in the same order.

import type { CatalogExercise } from "../shared/domain";
import {
  CHANGES_PAGE,
  PUSH_BATCH_MAX,
  SYNC_TABLES,
  type ChangesResult,
  type SyncDataMap,
  type SyncOp,
  type SyncRow,
  type SyncTable,
} from "../shared/sync";
import { backoffDelay } from "./backoff";
import { deleteSyncDB, dbNameFor, openSyncDB, type SyncDB } from "./db";
import type { FailedOp, LocalRow, OutboxEntry, SyncMeta, SyncStatus, SyncTransport } from "./types";

export function newCid(): string {
  return crypto.randomUUID();
}

export type SyncStoreOptions = {
  userKey: string;
  transport: SyncTransport;
  isOnline?: () => boolean;
  isAuthenticated?: () => boolean;
  now?: () => number;
  random?: () => number;
  /** Delay between a local write and the automatic flush it triggers (after start()). */
  flushDebounceMs?: number;
};

const rk = (table: string, cid: string) => `${table}\u0000${cid}`;
const isSyncTable = (t: string): t is SyncTable => (SYNC_TABLES as readonly string[]).includes(t);
const EMPTY: readonly never[] = Object.freeze([]);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const openStores = new Map<string, Set<SyncStore>>();

/**
 * Delete every local row, queued op and cached catalog for a user on this device.
 * Closes that user's open stores first. Unsynced ops are lost: check `getStatus().pending` before
 * calling on sign-out if you want to warn.
 */
export async function wipeLocalUser(userKey: string): Promise<void> {
  for (const s of [...(openStores.get(userKey) ?? [])]) s.close();
  await deleteSyncDB(userKey);
}

export class SyncStore {
  readonly userKey: string;
  readonly dbName: string;

  private db: SyncDB;
  private transport: SyncTransport;
  private opts: Required<Omit<SyncStoreOptions, "userKey" | "transport">>;

  // Memory mirror
  private rows = new Map<string, LocalRow>();
  private outbox = new Map<string, string>(); // opId -> row key
  private failed = new Map<string, FailedOp>();
  private meta: SyncMeta = { lastSeq: 0, lastSyncAt: null, catalogVersion: null };
  private catalog: CatalogExercise[] = [];

  // Snapshot caches for useSyncExternalStore
  private tableCache = new Map<SyncTable, readonly LocalRow[]>();
  private statusCache: SyncStatus | null = null;
  private listeners = new Set<() => void>();

  // Concurrency
  private chain: Promise<unknown> = Promise.resolve();
  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private pulling: Promise<void> | null = null;
  private pullAgain = false;

  // Flusher state
  private consecutiveFailures = 0;
  private backoffUntil = 0;
  private lastError: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private started = false;
  private closed = false;
  private unsubscribeChanges: (() => void) | null = null;
  private subscribedSince = -1;
  private detachEvents: (() => void) | null = null;
  private channel: BroadcastChannel | null = null;

  private constructor(db: SyncDB, options: SyncStoreOptions) {
    this.db = db;
    this.userKey = options.userKey;
    this.dbName = dbNameFor(options.userKey);
    this.transport = options.transport;
    this.opts = {
      isOnline: options.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine !== false),
      isAuthenticated: options.isAuthenticated ?? (() => true),
      now: options.now ?? Date.now,
      random: options.random ?? Math.random,
      flushDebounceMs: options.flushDebounceMs ?? 300,
    };
  }

  static async open(options: SyncStoreOptions): Promise<SyncStore> {
    let store: SyncStore | null = null;
    const db = await openSyncDB(options.userKey, () => store?.close());
    store = new SyncStore(db, options);
    await store.load();
    store.listenToOtherTabs();
    let set = openStores.get(options.userKey);
    if (!set) openStores.set(options.userKey, (set = new Set()));
    set.add(store);
    return store;
  }

  private async load() {
    const tx = this.db.transaction(["rows", "outbox", "failed", "meta", "catalog"], "readonly");
    const [rows, outbox, failed, meta, catalog] = await Promise.all([
      tx.objectStore("rows").getAll(),
      tx.objectStore("outbox").getAll(),
      tx.objectStore("failed").getAll(),
      tx.objectStore("meta").get("meta"),
      tx.objectStore("catalog").getAll(),
    ]);
    await tx.done;
    for (const r of rows) this.rows.set(rk(r.table, r.cid), r);
    for (const o of outbox) this.outbox.set(o.opId, rk(o.table, o.cid));
    for (const f of failed) this.failed.set(f.opId, f);
    if (meta) this.meta = meta;
    this.catalog = catalog;
  }

  /** Other tabs share this user's DB; when one commits, reload the memory mirror from IndexedDB. */
  private listenToOtherTabs() {
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(this.dbName);
    this.channel.onmessage = () => {
      void this.exclusive(async () => {
        if (this.closed) return;
        this.rows.clear();
        this.outbox.clear();
        this.failed.clear();
        await this.load();
        this.notify(SYNC_TABLES);
      });
    };
  }

  private broadcast() {
    try {
      this.channel?.postMessage("changed");
    } catch {
      /* channel closed */
    }
  }

  // ───────────────────────────── reads (synchronous, live rows only) ─────────────────────────────

  get<T extends SyncTable>(table: T, cid: string): LocalRow<T> | undefined {
    const r = this.rows.get(rk(table, cid));
    return r && !r.deleted ? (r as LocalRow<T>) : undefined;
  }

  list<T extends SyncTable>(table: T): readonly LocalRow<T>[] {
    let cached = this.tableCache.get(table);
    if (!cached) {
      const out: LocalRow[] = [];
      for (const r of this.rows.values()) if (r.table === table && !r.deleted) out.push(r);
      cached = Object.freeze(out);
      this.tableCache.set(table, cached);
    }
    return cached as readonly LocalRow<T>[];
  }

  getCatalog(): readonly CatalogExercise[] {
    return this.catalog;
  }

  getFailed(): readonly FailedOp[] {
    return [...this.failed.values()];
  }

  getMeta(): Readonly<SyncMeta> {
    return this.meta;
  }

  /** Full outbox entries (attempts, nextAttemptAt, lastError), oldest first. */
  async getOutbox(): Promise<OutboxEntry[]> {
    return this.db.getAllFromIndex("outbox", "createdAt");
  }

  getStatus = (): SyncStatus => {
    if (this.statusCache) return this.statusCache;
    const pending = this.outbox.size;
    const failed = this.failed.size;
    const state: SyncStatus["state"] = !this.opts.isOnline() || this.transport.isConnected?.() === false
      ? "offline"
      : this.flushing || this.pulling
        ? "syncing"
        : failed > 0 || this.lastError
          ? "error"
          : pending > 0
            ? "saved_local"
            : "synced";
    this.statusCache = { state, pending, failed, lastSyncAt: this.meta.lastSyncAt, lastError: this.lastError };
    return this.statusCache;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private committed(tables: Iterable<SyncTable> = []) {
    this.notify(tables);
    this.broadcast();
  }

  private notify(tables: Iterable<SyncTable> = []) {
    for (const t of tables) this.tableCache.delete(t);
    this.statusCache = null;
    for (const l of [...this.listeners]) l();
  }

  // ───────────────────────────── local writes ─────────────────────────────

  write<T extends SyncTable>(table: T, cid: string, data: SyncDataMap[T]): Promise<LocalRow<T>> {
    return this.put(table, cid, data, false) as Promise<LocalRow<T>>;
  }

  async remove(table: SyncTable, cid: string): Promise<void> {
    await this.put(table, cid, null, true);
  }

  private put(table: SyncTable, cid: string, data: unknown, deleted: boolean): Promise<LocalRow> {
    if (!isSyncTable(table)) return Promise.reject(new Error(`unknown table ${table}`));
    if (!cid) return Promise.reject(new Error("cid required"));
    return this.exclusive(async () => {
      this.assertOpen();
      const key = rk(table, cid);
      const prev = this.rows.get(key);
      // Local edits always move forward, even if the device clock went backwards.
      const updatedAt = Math.max(this.opts.now(), (prev?.updatedAt ?? 0) + 1);
      const row: LocalRow = {
        table,
        cid,
        updatedAt,
        deleted,
        seq: prev?.seq ?? 0,
        data: deleted ? null : (data as LocalRow["data"]),
        dirty: true,
      };
      const op: SyncOp = { opId: newCid(), table, cid, updatedAt, deleted, data: row.data };
      const entry: OutboxEntry = {
        opId: op.opId,
        table,
        cid,
        op,
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        createdAt: this.opts.now(),
      };

      // Row + outbox in ONE transaction: the op is durable before the promise resolves.
      const tx = this.db.transaction(["rows", "outbox"], "readwrite");
      const ob = tx.objectStore("outbox");
      // Coalesce: keep only the latest state per row in the outbox.
      const superseded = await ob.index("row").getAllKeys([table, cid]);
      await Promise.all([...superseded.map((k) => ob.delete(k)), ob.put(entry), tx.objectStore("rows").put(row), tx.done]);

      this.rows.set(key, row);
      for (const k of superseded) this.outbox.delete(k);
      this.outbox.set(op.opId, key);
      this.committed([table]);
      this.scheduleFlush();
      return row;
    });
  }

  // ───────────────────────────── flusher ─────────────────────────────

  /**
   * Push queued ops in batches. Single-flight within the tab, and across tabs via Web Locks when
   * available. `force` ignores the current backoff window (used for online/visible/start/retry).
   */
  flush(opts: { force?: boolean } = {}): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.flushing) {
      this.flushAgain = true;
      if (opts.force) this.backoffUntil = 0;
      return this.flushing;
    }
    if (opts.force) this.backoffUntil = 0;
    this.flushing = (async () => {
      try {
        do {
          this.flushAgain = false;
          await this.withLock(() => this.flushOnce());
        } while (this.flushAgain && !this.closed && this.consecutiveFailures === 0);
      } finally {
        this.flushing = null;
        if (!this.closed) this.notify();
      }
    })();
    this.notify();
    return this.flushing;
  }

  private async withLock(fn: () => Promise<void>) {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator).locks : undefined;
    if (!locks?.request) return fn();
    await locks.request(`${this.dbName}:flush`, { ifAvailable: true }, async (lock) => {
      if (lock) await fn(); // null: another tab is flushing this user's outbox right now
    });
  }

  private async flushOnce() {
    for (;;) {
      if (this.closed || !this.opts.isOnline() || !this.opts.isAuthenticated()) return;
      if (this.opts.now() < this.backoffUntil) return;
      const batch = (await this.db.getAllFromIndex("outbox", "createdAt")).slice(0, PUSH_BATCH_MAX);
      if (batch.length === 0) return;

      let result;
      try {
        result = await this.transport.push(batch.map((e) => e.op));
      } catch (e) {
        await this.recordFailure(batch, errMsg(e));
        return;
      }

      const applied = new Set(result.applied);
      const rejected = new Map(result.rejected.map((r) => [r.opId, r.reason]));
      const progressed = batch.some((e) => applied.has(e.opId) || rejected.has(e.opId));
      await this.acknowledge(batch, applied, rejected);
      if (!progressed) {
        await this.recordFailure(batch, "push made no progress");
        return;
      }
      this.consecutiveFailures = 0;
      this.backoffUntil = 0;
      this.lastError = null;
      this.notify();
    }
  }

  private acknowledge(batch: OutboxEntry[], applied: Set<string>, rejected: Map<string, string>) {
    return this.exclusive(async () => {
      if (this.closed) return;
      const tx = this.db.transaction(["rows", "outbox", "failed"], "readwrite");
      const rows = tx.objectStore("rows");
      const ob = tx.objectStore("outbox");
      const cleaned: LocalRow[] = [];
      const newFailed: FailedOp[] = [];
      const done: string[] = [];
      for (const e of batch) {
        if (applied.has(e.opId)) {
          done.push(e.opId);
          ob.delete(e.opId);
          const row = await rows.get([e.table, e.cid]);
          // Only clean if no newer local edit happened while the push was in flight.
          if (row && row.dirty && row.updatedAt === e.op.updatedAt) {
            const clean = { ...row, dirty: false };
            rows.put(clean);
            cleaned.push(clean);
          }
        } else if (rejected.has(e.opId)) {
          done.push(e.opId);
          ob.delete(e.opId);
          const f: FailedOp = { opId: e.opId, op: e.op, reason: rejected.get(e.opId)!, at: this.opts.now() };
          tx.objectStore("failed").put(f);
          newFailed.push(f);
        }
      }
      await tx.done;
      for (const id of done) this.outbox.delete(id);
      for (const r of cleaned) this.rows.set(rk(r.table, r.cid), r);
      for (const f of newFailed) this.failed.set(f.opId, f);
      this.committed(cleaned.map((r) => r.table));
    });
  }

  private recordFailure(batch: OutboxEntry[], message: string) {
    this.consecutiveFailures++;
    const delay = backoffDelay(this.consecutiveFailures, this.opts.random);
    const now = this.opts.now();
    this.backoffUntil = now + delay;
    this.lastError = message;
    this.scheduleRetry(delay);
    return this.exclusive(async () => {
      if (this.closed) return;
      const tx = this.db.transaction("outbox", "readwrite");
      for (const e of batch) {
        const cur = await tx.store.get(e.opId);
        if (cur) tx.store.put({ ...cur, attempts: cur.attempts + 1, nextAttemptAt: now + delay, lastError: message });
      }
      await tx.done;
      this.notify();
    });
  }

  /** Current backoff window, for diagnostics/tests. */
  getBackoff(): { failures: number; until: number } {
    return { failures: this.consecutiveFailures, until: this.backoffUntil };
  }

  private scheduleRetry(delay: number) {
    if (!this.started || this.closed) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, delay);
  }

  private scheduleFlush() {
    if (!this.started || this.closed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.opts.flushDebounceMs);
  }

  /** Re-queue a rejected op (e.g. after the user fixed something), unless a newer edit exists. */
  async retryFailed(opId: string): Promise<void> {
    await this.exclusive(async () => {
      const f = this.failed.get(opId);
      if (!f) return;
      const tx = this.db.transaction(["outbox", "failed"], "readwrite");
      const newer = await tx.objectStore("outbox").index("row").count([f.op.table, f.op.cid]);
      if (newer === 0) {
        tx.objectStore("outbox").put({
          opId: f.opId,
          table: f.op.table,
          cid: f.op.cid,
          op: f.op,
          attempts: 0,
          nextAttemptAt: 0,
          lastError: null,
          createdAt: this.opts.now(),
        });
      }
      tx.objectStore("failed").delete(opId);
      await tx.done;
      this.failed.delete(opId);
      if (newer === 0) this.outbox.set(f.opId, rk(f.op.table, f.op.cid));
      this.committed();
    });
    this.scheduleFlush();
  }

  /** Drop a rejected op. The row becomes clean so the server's version can replace it. */
  async discardFailed(opId: string): Promise<void> {
    await this.exclusive(async () => {
      const f = this.failed.get(opId);
      if (!f) return;
      const tx = this.db.transaction(["rows", "outbox", "failed"], "readwrite");
      tx.objectStore("failed").delete(opId);
      const pendingForRow = await tx.objectStore("outbox").index("row").count([f.op.table, f.op.cid]);
      const row = await tx.objectStore("rows").get([f.op.table, f.op.cid]);
      let cleaned: LocalRow | null = null;
      if (row && row.dirty && pendingForRow === 0) {
        cleaned = { ...row, dirty: false };
        tx.objectStore("rows").put(cleaned);
      }
      await tx.done;
      this.failed.delete(opId);
      if (cleaned) this.rows.set(rk(cleaned.table, cleaned.cid), cleaned);
      this.committed(cleaned ? [cleaned.table] : []);
    });
  }

  // ───────────────────────────── pull / merge ─────────────────────────────

  /** Page through `changes` from meta.lastSeq until hasMore is false, merging each page. */
  pull(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.pulling) {
      this.pullAgain = true;
      return this.pulling;
    }
    this.pulling = (async () => {
      try {
        do {
          this.pullAgain = false;
          if (!this.opts.isOnline() || !this.opts.isAuthenticated()) return;
          for (;;) {
            const since = this.meta.lastSeq;
            const res = await this.transport.changes(since, CHANGES_PAGE);
            if (this.closed) return;
            await this.merge(res.rows, nextCursor(since, res));
            if (!res.hasMore) break;
          }
        } while (this.pullAgain && !this.closed);
        this.resubscribe();
      } catch (e) {
        this.lastError = errMsg(e);
      } finally {
        this.pulling = null;
        if (!this.closed) this.notify();
      }
    })();
    this.notify();
    return this.pulling;
  }

  /**
   * Merge server rows. Server row wins unless the local row is newer (a pending local edit, or a
   * version we already have). Tombstones are stored (hidden from list/get), never dropped.
   * lastSeq advances in the same transaction as the rows it covers.
   */
  private merge(serverRows: SyncRow[], nextSeq: number) {
    return this.exclusive(async () => {
      if (this.closed) return;
      const tx = this.db.transaction(["rows", "outbox", "meta"], "readwrite");
      const rows = tx.objectStore("rows");
      const ob = tx.objectStore("outbox");
      const applied: LocalRow[] = [];
      const droppedOps: string[] = [];
      for (const s of serverRows) {
        if (!isSyncTable(s.table)) continue;
        const local = await rows.get([s.table, s.cid]);
        if (local && local.updatedAt > s.updatedAt) continue;
        if (local?.dirty) {
          // Server has this version or a newer one: our queued op is redundant.
          const keys = await ob.index("row").getAllKeys([s.table, s.cid]);
          for (const k of keys) {
            ob.delete(k);
            droppedOps.push(k);
          }
        }
        const next: LocalRow = { ...s, dirty: false };
        rows.put(next);
        applied.push(next);
      }
      const meta: SyncMeta = {
        ...this.meta,
        lastSeq: Math.max(this.meta.lastSeq, nextSeq),
        lastSyncAt: this.opts.now(),
      };
      tx.objectStore("meta").put(meta, "meta");
      await tx.done;
      for (const r of applied) this.rows.set(rk(r.table, r.cid), r);
      for (const k of droppedOps) this.outbox.delete(k);
      this.meta = meta;
      this.committed(new Set(applied.map((r) => r.table)));
    });
  }

  private resubscribe() {
    if (!this.started || this.closed || !this.transport.subscribe) return;
    if (this.subscribedSince === this.meta.lastSeq && this.unsubscribeChanges) return;
    this.unsubscribeChanges?.();
    this.subscribedSince = this.meta.lastSeq;
    this.unsubscribeChanges = this.transport.subscribe(this.meta.lastSeq, () => void this.pull());
  }

  // ───────────────────────────── catalog ─────────────────────────────

  /** Refetch the catalog only when the server version differs. Returns true if replaced. */
  async syncCatalog(): Promise<boolean> {
    if (this.closed || !this.opts.isOnline()) return false;
    const meta = await this.transport.catalogMeta();
    const version = typeof meta === "string" ? meta : (meta?.version ?? null);
    if (version === null || version === this.meta.catalogVersion) return false;
    const all: CatalogExercise[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await this.transport.catalogPage(cursor, 500);
      all.push(...page.page);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    await this.exclusive(async () => {
      if (this.closed) return;
      const tx = this.db.transaction(["catalog", "meta"], "readwrite");
      const cat = tx.objectStore("catalog");
      await cat.clear();
      for (const ex of all) cat.put(ex);
      const nextMeta = { ...this.meta, catalogVersion: version };
      tx.objectStore("meta").put(nextMeta, "meta");
      await tx.done;
      this.catalog = all;
      this.meta = nextMeta;
      this.committed();
    });
    return true;
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  /** Wire up auto-flush, retry triggers, the changes subscription and the catalog check. */
  start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    const kick = () => this.kick();
    const onOffline = () => this.notify();
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") kick();
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("online", kick);
      window.addEventListener("offline", onOffline);
    }
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", onVisible);
    }
    const detachConn = this.transport.onConnectionChange?.(() => {
      this.notify();
      if (this.transport.isConnected?.()) kick(); // back online: retry now, not after backoff
    });
    this.detachEvents = () => {
      detachConn?.();
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("online", kick);
        window.removeEventListener("offline", onOffline);
      }
      if (typeof document !== "undefined" && document.removeEventListener) {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
    this.kick();
    void this.syncCatalog().catch((e) => {
      this.lastError = errMsg(e);
      this.notify();
    });
  }

  /** Flush (ignoring backoff) and pull now. Call after sign-in / auth refresh too. */
  kick(): void {
    if (this.closed) return;
    this.notify();
    void this.flush({ force: true });
    void this.pull();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.started = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.unsubscribeChanges?.();
    this.unsubscribeChanges = null;
    this.detachEvents?.();
    this.channel?.close();
    this.channel = null;
    this.db.close();
    openStores.get(this.userKey)?.delete(this);
    this.rows.clear();
    this.outbox.clear();
    this.failed.clear();
    this.catalog = [];
    this.tableCache.clear();
    this.notify();
    this.listeners.clear();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private assertOpen() {
    if (this.closed) throw new Error("SyncStore is closed");
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
}

/**
 * Cursor for the next `changes` call. While hasMore, trust the last row's seq (never skip rows in
 * the page); once caught up, the server's reported seq is safe to adopt.
 */
function nextCursor(since: number, res: ChangesResult): number {
  const lastRow = res.rows.length ? res.rows[res.rows.length - 1].seq : since;
  return res.hasMore ? Math.max(since, res.rows.length ? lastRow : res.seq) : Math.max(since, lastRow, res.seq);
}

export { EMPTY as EMPTY_ROWS };
