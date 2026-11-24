// In-memory server with the semantics of the sync contract (src/shared/sync.ts): idempotent
// upserts keyed by (owner, table, cid), last-writer-wins on updatedAt (tombstone wins ties),
// per-user monotonically increasing seq, paged changes(since). Test/dev use only.

import type { CatalogExercise } from "../shared/domain";
import { SYNC_TABLES, type ChangesResult, type PushResult, type SyncOp, type SyncRow } from "../shared/sync";
import type { CatalogPage, SyncTransport } from "./types";

type UserState = { seq: number; rows: Map<string, SyncRow> };

export class NetworkError extends Error {}

export class FakeServer {
  users = new Map<string, UserState>();
  catalogVersion = "v1";
  catalogItems: CatalogExercise[] = [];
  catalogMetaCalls = 0;
  catalogPageCalls = 0;
  /** Extra validation; return a reason to reject. */
  rejectIf: ((op: SyncOp) => string | null) | null = null;
  private listeners = new Map<string, Set<() => void>>();

  private user(userId: string): UserState {
    let u = this.users.get(userId);
    if (!u) this.users.set(userId, (u = { seq: 0, rows: new Map() }));
    return u;
  }

  rowsOf(userId: string): SyncRow[] {
    return [...this.user(userId).rows.values()];
  }

  seqOf(userId: string): number {
    return this.user(userId).seq;
  }

  push(userId: string, ops: SyncOp[]): PushResult {
    const u = this.user(userId);
    const applied: string[] = [];
    const rejected: PushResult["rejected"] = [];
    let changed = false;
    for (const op of ops) {
      const reason = this.validate(op);
      if (reason) {
        rejected.push({ opId: op.opId, reason });
        continue;
      }
      const key = `${op.table}:${op.cid}`;
      const cur = u.rows.get(key);
      const wins = !cur || op.updatedAt > cur.updatedAt || (op.updatedAt === cur.updatedAt && op.deleted && !cur.deleted);
      if (wins) {
        u.seq++;
        u.rows.set(key, { table: op.table, cid: op.cid, updatedAt: op.updatedAt, deleted: op.deleted, seq: u.seq, data: op.deleted ? null : op.data });
        changed = true;
      }
      applied.push(op.opId); // accepted or ignored as stale: both are "done"
    }
    if (changed) for (const l of [...(this.listeners.get(userId) ?? [])]) l();
    return { applied, rejected, seq: u.seq };
  }

  changes(userId: string, since: number, limit = 500): ChangesResult {
    const u = this.user(userId);
    const all = [...u.rows.values()].filter((r) => r.seq > since).sort((a, b) => a.seq - b.seq);
    const rows = all.slice(0, limit).map((r) => ({ ...r }));
    const hasMore = all.length > limit;
    return { rows, hasMore, seq: hasMore ? rows[rows.length - 1].seq : u.seq };
  }

  private validate(op: SyncOp): string | null {
    if (!(SYNC_TABLES as readonly string[]).includes(op.table)) return "unknown table";
    if (typeof op.cid !== "string" || !op.cid) return "bad cid";
    if (!Number.isFinite(op.updatedAt)) return "bad updatedAt";
    if (!op.deleted && op.data == null) return "data required";
    return this.rejectIf?.(op) ?? null;
  }

  listen(userId: string, cb: () => void): () => void {
    let set = this.listeners.get(userId);
    if (!set) this.listeners.set(userId, (set = new Set()));
    set.add(cb);
    return () => set!.delete(cb);
  }

  transport(userId: string): FakeTransport {
    return new FakeTransport(this, userId);
  }
}

export class FakeTransport implements SyncTransport {
  down = false;
  /** Apply the next push on the server, then fail as if the response was lost. */
  loseNextResponse = false;
  pushCalls: SyncOp[][] = [];

  constructor(
    readonly server: FakeServer,
    readonly userId: string,
  ) {}

  async push(ops: SyncOp[]): Promise<PushResult> {
    await tick();
    this.pushCalls.push(structuredClone(ops));
    if (this.down) throw new NetworkError("network down");
    const res = this.server.push(this.userId, structuredClone(ops));
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new NetworkError("connection reset after apply");
    }
    return res;
  }

  async changes(since: number, limit?: number): Promise<ChangesResult> {
    await tick();
    if (this.down) throw new NetworkError("network down");
    return this.server.changes(this.userId, since, limit);
  }

  subscribe(_since: number, onChange: () => void): () => void {
    return this.server.listen(this.userId, onChange);
  }

  async catalogMeta() {
    await tick();
    if (this.down) throw new NetworkError("network down");
    this.server.catalogMetaCalls++;
    return { version: this.server.catalogVersion };
  }

  async catalogPage(cursor: string | null, numItems: number): Promise<CatalogPage> {
    await tick();
    if (this.down) throw new NetworkError("network down");
    this.server.catalogPageCalls++;
    const start = cursor ? Number(cursor) : 0;
    const page = this.server.catalogItems.slice(start, start + numItems);
    const end = start + page.length;
    return { page, isDone: end >= this.server.catalogItems.length, continueCursor: String(end) };
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
