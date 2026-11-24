import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogExercise } from "../shared/domain";
import { PUSH_BATCH_MAX, type SetData } from "../shared/sync";
import { BACKOFF_MAX_MS, backoffDelay } from "./backoff";
import { dbNameFor } from "./db";
import { FakeServer, type FakeTransport } from "./fakeServer";
import { newCid, SyncStore, wipeLocalUser, type SyncStoreOptions } from "./store";

const open: SyncStore[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

let userCounter = 0;
const uniqueUser = (name: string) => `${name}-${++userCounter}-${newCid()}`;

async function openStore(
  userKey: string,
  transport: FakeTransport,
  extra: Partial<SyncStoreOptions> = {},
): Promise<SyncStore> {
  const s = await SyncStore.open({ userKey, transport, ...extra });
  open.push(s);
  return s;
}

const set = (over: Partial<SetData> = {}): SetData => ({
  sessionCid: "s1",
  sessionExerciseCid: "se1",
  exId: "bench_press",
  order: 0,
  kind: "working",
  weightKg: 100,
  entered: { value: 100, unit: "kg" },
  reps: 5,
  assistKg: null,
  durationSec: null,
  distanceM: null,
  rpe: null,
  done: true,
  completedAt: 1,
  ...over,
});

const until = async (cond: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("durable outbox", () => {
  it("reports offline (not 'syncing' forever) while the backend connection is down", async () => {
    const server = new FakeServer();
    const user = uniqueUser("conn");
    let connected = false;
    let notify = () => {};
    const t: FakeTransport = Object.assign(server.transport(user), {
      isConnected: () => connected,
      onConnectionChange: (cb: () => void) => {
        notify = cb;
        return () => {};
      },
    });
    const s = await openStore(user, t);
    s.start();
    await s.write("sets", newCid(), set());
    expect(s.getStatus()).toMatchObject({ state: "offline", pending: 1 });
    connected = true;
    notify(); // reconnect: status recomputes and a flush is kicked without waiting for backoff
    await until(() => s.getStatus().state === "synced");
    expect(server.rowsOf(user)).toHaveLength(1);
  });

  it("(1) offline write survives reload and lands exactly once", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    let online = false;
    const t = server.transport(user);
    const s1 = await openStore(user, t, { isOnline: () => online });
    const cid = newCid();
    await s1.write("sets", cid, set({ reps: 8 }));
    await s1.flush();
    expect(t.pushCalls).toHaveLength(0);
    expect(s1.getStatus()).toMatchObject({ state: "offline", pending: 1 });
    s1.close(); // simulate kill

    online = true;
    const s2 = await openStore(user, t, { isOnline: () => online });
    expect(s2.get("sets", cid)?.data).toMatchObject({ reps: 8 });
    expect(await s2.getOutbox()).toHaveLength(1);
    expect(s2.getStatus()).toMatchObject({ state: "saved_local", pending: 1 });

    await s2.flush();
    await s2.pull();
    expect(server.rowsOf(user)).toHaveLength(1);
    expect(server.rowsOf(user)[0]).toMatchObject({ cid, deleted: false, data: { reps: 8 } });
    expect(await s2.getOutbox()).toHaveLength(0);
    expect(s2.get("sets", cid)).toMatchObject({ dirty: false, seq: 1 });
    expect(s2.getStatus()).toMatchObject({ state: "synced", pending: 0 });
  });

  it("(2) lost push response then retry does not duplicate", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);
    const cid = newCid();
    await s.write("sets", cid, set());
    t.loseNextResponse = true;
    await s.flush();
    expect(server.rowsOf(user)).toHaveLength(1); // applied server-side…
    expect(await s.getOutbox()).toHaveLength(1); // …but client doesn't know
    expect(s.getStatus().state).toBe("error");

    await s.flush({ force: true });
    expect(t.pushCalls).toHaveLength(2);
    expect(t.pushCalls[0][0].opId).toBe(t.pushCalls[1][0].opId);
    expect(server.rowsOf(user)).toHaveLength(1);
    expect(server.seqOf(user)).toBe(1); // replay was a no-op
    await s.pull();
    expect(s.list("sets")).toHaveLength(1);
    expect(s.getStatus()).toMatchObject({ state: "synced", pending: 0 });
  });

  it("(3) rapid edits coalesce to one op with the latest state", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);
    const cid = newCid();
    const writes = [];
    for (let reps = 1; reps <= 10; reps++) writes.push(s.write("sets", cid, set({ reps })));
    await Promise.all(writes);
    const outbox = await s.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].op.data).toMatchObject({ reps: 10 });
    expect(s.getStatus().pending).toBe(1);

    await s.flush();
    expect(t.pushCalls).toHaveLength(1);
    expect(t.pushCalls[0]).toHaveLength(1);
    expect(server.rowsOf(user)[0].data).toMatchObject({ reps: 10 });
  });

  it("updatedAt always moves forward even if the clock goes backwards", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    let now = 10_000;
    const s = await openStore(user, server.transport(user), { now: () => now });
    const a = await s.write("sets", "x", set({ reps: 1 }));
    now = 5_000;
    const b = await s.write("sets", "x", set({ reps: 2 }));
    expect(b.updatedAt).toBe(a.updatedAt + 1);
  });

  it("edit during an in-flight push is not lost or marked clean", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);
    const cid = newCid();
    await s.write("sets", cid, set({ reps: 5 }));
    const flushing = s.flush();
    await s.write("sets", cid, set({ reps: 6 })); // lands while push #1 is in flight
    await flushing;
    await s.flush();
    expect(server.rowsOf(user)).toHaveLength(1);
    expect(server.rowsOf(user)[0].data).toMatchObject({ reps: 6 });
    expect(s.get("sets", cid)).toMatchObject({ dirty: false, data: { reps: 6 } });
    expect(s.getStatus().pending).toBe(0);
  });

  it("sends batches of at most PUSH_BATCH_MAX", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);
    const n = PUSH_BATCH_MAX + 20;
    for (let i = 0; i < n; i++) await s.write("sets", newCid(), set({ order: i }));
    await s.flush();
    expect(t.pushCalls.map((b) => b.length)).toEqual([PUSH_BATCH_MAX, 20]);
    expect(server.rowsOf(user)).toHaveLength(n);
  });
});

describe("pull / merge", () => {
  it("(4) dirty local edit beats older server row; newer server row replaces clean local row", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    let now = 1_000_000;
    const t = server.transport(user);
    const phone = await openStore(user, t, { now: () => now });
    const other = server.transport(user); // another device, same account
    const cid = newCid();

    // Other device wrote earlier; phone has a newer pending edit.
    server.push(user, [{ opId: newCid(), table: "sets", cid, updatedAt: now - 1000, deleted: false, data: set({ reps: 3 }) }]);
    await phone.write("sets", cid, set({ reps: 7 }));
    await phone.pull();
    expect(phone.get("sets", cid)).toMatchObject({ dirty: true, data: { reps: 7 } });

    await phone.flush();
    expect(server.rowsOf(user)[0].data).toMatchObject({ reps: 7 });
    await phone.pull();
    expect(phone.get("sets", cid)?.dirty).toBe(false);

    // Other device edits later: replaces phone's clean row.
    now += 60_000;
    await other.push([{ opId: newCid(), table: "sets", cid, updatedAt: now, deleted: false, data: set({ reps: 9 }) }]);
    await phone.pull();
    expect(phone.get("sets", cid)).toMatchObject({ dirty: false, data: { reps: 9 } });
    expect(phone.list("sets")).toHaveLength(1);
  });

  it("live subscription pulls other-device changes after start()", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const phone = await openStore(user, server.transport(user), { flushDebounceMs: 0 });
    phone.start();
    await until(() => phone.getStatus().state === "synced");
    await server.transport(user).push([
      { opId: newCid(), table: "favorites", cid: "f1", updatedAt: Date.now(), deleted: false, data: { exId: "squat" } },
    ]);
    await until(() => phone.list("favorites").length === 1);
    // and local writes auto-flush
    await phone.write("favorites", "f2", { exId: "deadlift" });
    await until(() => server.rowsOf(user).length === 2 && phone.getStatus().pending === 0);
  });

  it("pages through changes and only advances lastSeq with committed rows", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const ops = Array.from({ length: 1200 }, (_, i) => ({
      opId: newCid(),
      table: "sets" as const,
      cid: `c${i}`,
      updatedAt: 1 + i,
      deleted: false,
      data: set({ order: i }),
    }));
    server.push(user, ops);
    const s = await openStore(user, server.transport(user));
    await s.pull();
    expect(s.list("sets")).toHaveLength(1200);
    expect(s.getMeta().lastSeq).toBe(1200);
  });

  it("(5) delete → reload → sync leaves a tombstone on the server", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s1 = await openStore(user, t);
    const cid = newCid();
    await s1.write("sets", cid, set());
    await s1.flush();
    let online = false;
    const s2 = await openStore(user, t, { isOnline: () => online });
    s1.close();
    await s2.remove("sets", cid);
    expect(s2.get("sets", cid)).toBeUndefined();
    s2.close();

    online = true;
    const s3 = await openStore(user, t, { isOnline: () => online });
    expect(s3.list("sets")).toHaveLength(0);
    await s3.flush();
    await s3.pull();
    expect(server.rowsOf(user)).toHaveLength(1);
    expect(server.rowsOf(user)[0]).toMatchObject({ cid, deleted: true, data: null });
    expect(s3.get("sets", cid)).toBeUndefined();
    expect(s3.list("sets")).toHaveLength(0);
  });
});

describe("failures", () => {
  it("(6) rejected op is surfaced in failed and does not block others", async () => {
    const server = new FakeServer();
    server.rejectIf = (op) => (op.table === "sets" && (op.data as SetData | null)?.reps === -1 ? "reps must be ≥ 0" : null);
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);
    const bad = newCid();
    const good = newCid();
    await s.write("sets", bad, set({ reps: -1 }));
    await s.write("sets", good, set({ reps: 5 }));
    await s.flush();
    expect(server.rowsOf(user).map((r) => r.cid)).toEqual([good]);
    expect(s.getFailed()).toHaveLength(1);
    expect(s.getFailed()[0]).toMatchObject({ reason: "reps must be ≥ 0", op: { cid: bad } });
    expect(s.getStatus()).toMatchObject({ state: "error", pending: 0, failed: 1 });

    // Not retried forever: further flushes don't resend it, later writes still go through.
    await s.write("sets", newCid(), set({ reps: 6 }));
    await s.flush();
    expect(t.pushCalls.flat().filter((o) => o.cid === bad)).toHaveLength(1);
    expect(server.rowsOf(user)).toHaveLength(2);

    // Survives reload; discard clears it.
    s.close();
    const s2 = await openStore(user, t);
    expect(s2.getFailed()).toHaveLength(1);
    await s2.discardFailed(s2.getFailed()[0].opId);
    expect(s2.getStatus()).toMatchObject({ state: "synced", failed: 0 });
  });

  it("(7) backoff schedule: exponential with jitter, capped, forced retries bypass it", async () => {
    expect(backoffDelay(1, () => 0.5)).toBe(1000);
    expect(backoffDelay(2, () => 0.5)).toBe(2000);
    expect(backoffDelay(3, () => 0.5)).toBe(4000);
    expect(backoffDelay(6, () => 0.5)).toBe(32000);
    expect(backoffDelay(7, () => 0.5)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(50, () => 1)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(1, () => 0)).toBe(750);
    expect(backoffDelay(1, () => 1)).toBe(1250);
    for (let i = 1; i < 12; i++) expect(backoffDelay(i + 1, () => 0.5)).toBeGreaterThanOrEqual(backoffDelay(i, () => 0.5));

    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    let now = 1_000_000;
    const s = await openStore(user, t, { now: () => now, random: () => 0.5 });
    await s.write("sets", newCid(), set());
    t.down = true;

    await s.flush();
    expect(s.getBackoff()).toEqual({ failures: 1, until: now + 1000 });
    let [entry] = await s.getOutbox();
    expect(entry).toMatchObject({ attempts: 1, nextAttemptAt: now + 1000, lastError: "network down" });
    expect(s.getStatus()).toMatchObject({ state: "error", pending: 1 });

    await s.flush(); // inside the window: no request
    expect(t.pushCalls).toHaveLength(1);

    now += 1000;
    await s.flush();
    expect(s.getBackoff()).toEqual({ failures: 2, until: now + 2000 });
    now += 2000;
    await s.flush();
    expect(s.getBackoff()).toEqual({ failures: 3, until: now + 4000 });
    [entry] = await s.getOutbox();
    expect(entry.attempts).toBe(3);

    // `online` / visibility / start use force: retry immediately.
    t.down = false;
    await s.flush({ force: true });
    expect(s.getBackoff()).toEqual({ failures: 0, until: 0 });
    expect(server.rowsOf(user)).toHaveLength(1);
    expect(s.getStatus()).toMatchObject({ state: "synced", pending: 0 });
  });

  it("does not push while signed out", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    let authed = false;
    const s = await openStore(user, t, { isAuthenticated: () => authed });
    await s.write("sets", newCid(), set());
    await s.flush({ force: true });
    expect(t.pushCalls).toHaveLength(0);
    authed = true;
    await s.flush({ force: true });
    expect(server.rowsOf(user)).toHaveLength(1);
  });
});

describe("isolation", () => {
  it("(8) user A's rows are not visible after switching to user B; wipe removes A", async () => {
    const server = new FakeServer();
    const a = uniqueUser("alice");
    const b = uniqueUser("bob");
    expect(dbNameFor(a)).not.toBe(dbNameFor(b));

    const sa = await openStore(a, server.transport(a));
    await sa.write("sets", newCid(), set({ reps: 12 }));
    await sa.write("settings", "me", {
      unit: "kg",
      bodyweightKg: 80,
      availableEquipment: [],
      defaultRestSec: 120,
      barKg: 20,
      platesKg: [25, 20, 10, 5, 2.5, 1.25],
      showCommunityImages: false,
      activeProgramCid: null,
      goal: null,
      sessionMinutes: null,
    });
    await sa.flush();
    sa.close(); // sign out

    const sb = await openStore(b, server.transport(b));
    await sb.pull();
    expect(sb.list("sets")).toHaveLength(0);
    expect(sb.list("settings")).toHaveLength(0);
    expect(sa.list("sets")).toHaveLength(0); // closed store exposes nothing

    await wipeLocalUser(a);
    const sa2 = await openStore(a, server.transport(a), { isOnline: () => false });
    expect(sa2.list("sets")).toHaveLength(0);
    expect(await sa2.getOutbox()).toHaveLength(0);
  });

  it("wipeLocalUser closes an open store for that user", async () => {
    const server = new FakeServer();
    const a = uniqueUser("alice");
    const sa = await openStore(a, server.transport(a));
    await sa.write("sets", newCid(), set());
    await wipeLocalUser(a);
    expect(sa.isClosed).toBe(true);
    await expect(sa.write("sets", newCid(), set())).rejects.toThrow(/closed/);
  });
});

describe("catalog cache", () => {
  const ex = (exId: string) => ({ exId, name: exId }) as unknown as CatalogExercise;

  it("(9) refetches only when the version changes and works offline from cache", async () => {
    const server = new FakeServer();
    server.catalogItems = Array.from({ length: 1234 }, (_, i) => ex(`ex${i}`));
    const user = uniqueUser("a");
    const t = server.transport(user);
    const s = await openStore(user, t);

    expect(await s.syncCatalog()).toBe(true);
    expect(s.getCatalog()).toHaveLength(1234);
    expect(server.catalogPageCalls).toBe(3);

    expect(await s.syncCatalog()).toBe(false);
    expect(server.catalogPageCalls).toBe(3);

    server.catalogVersion = "v2";
    server.catalogItems = [ex("new1"), ex("new2")];
    expect(await s.syncCatalog()).toBe(true);
    expect(s.getCatalog().map((e) => e.exId)).toEqual(["new1", "new2"]);
    expect(s.getMeta().catalogVersion).toBe("v2");

    // Offline reload: cached catalog, no network.
    s.close();
    t.down = true;
    const calls = server.catalogMetaCalls;
    const s2 = await openStore(user, t, { isOnline: () => false });
    expect(s2.getCatalog().map((e) => e.exId)).toEqual(["new1", "new2"]);
    expect(await s2.syncCatalog()).toBe(false);
    expect(server.catalogMetaCalls).toBe(calls);
  });
});

describe("never lose or duplicate a set", () => {
  it("random interleaving of offline writes, crashes, lost responses and retries converges", async () => {
    const server = new FakeServer();
    const user = uniqueUser("a");
    const t = server.transport(user);
    let online = true;
    let s = await openStore(user, t, { isOnline: () => online });
    const expected = new Map<string, number | null>();
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const cids = Array.from({ length: 15 }, () => newCid());

    for (let step = 0; step < 200; step++) {
      const r = rnd();
      const cid = cids[Math.floor(rnd() * cids.length)];
      if (r < 0.5) {
        const reps = Math.floor(rnd() * 20);
        await s.write("sets", cid, set({ reps }));
        expected.set(cid, reps);
      } else if (r < 0.6) {
        await s.remove("sets", cid);
        expected.set(cid, null);
      } else if (r < 0.7) {
        online = !online;
      } else if (r < 0.8) {
        t.loseNextResponse = true;
        await s.flush({ force: true });
      } else if (r < 0.9) {
        s.close();
        s = await openStore(user, t, { isOnline: () => online });
      } else {
        await s.flush({ force: true });
        await s.pull();
      }
    }
    online = true;
    t.loseNextResponse = false;
    await s.flush({ force: true });
    await s.pull();

    const serverRows = server.rowsOf(user);
    expect(new Set(serverRows.map((r) => r.cid)).size).toBe(serverRows.length);
    for (const [cid, reps] of expected) {
      const row = serverRows.find((r) => r.cid === cid);
      if (reps === null) expect(row?.deleted ?? true).toBe(true);
      else expect(row).toMatchObject({ deleted: false, data: { reps } });
      const local = s.get("sets", cid);
      if (reps === null) expect(local).toBeUndefined();
      else expect(local).toMatchObject({ dirty: false, data: { reps } });
    }
    expect(s.list("sets")).toHaveLength([...expected.values()].filter((v) => v !== null).length);
    expect(s.getStatus()).toMatchObject({ pending: 0, failed: 0 });
  });
});
