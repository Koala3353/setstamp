import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { setup, signInAs } from "./test.setup";
import type { SetData, SyncOp } from "../src/shared/sync";

const NOW = Date.now();

function setOp(over: Partial<SyncOp<"sets">> = {}, data: Partial<SetData> = {}): SyncOp<"sets"> {
  return {
    opId: over.opId ?? crypto.randomUUID(),
    table: "sets",
    cid: over.cid ?? "set-1",
    updatedAt: over.updatedAt ?? NOW,
    deleted: over.deleted ?? false,
    data:
      over.data === null
        ? null
        : {
            sessionCid: "s1",
            sessionExerciseCid: "se1",
            exId: "ex_bench_press",
            order: 0,
            kind: "working",
            weightKg: 100,
            entered: { value: 100, unit: "kg" },
            reps: 5,
            assistKg: null,
            durationSec: null,
            distanceM: null,
            rpe: 8,
            done: true,
            completedAt: NOW,
            ...data,
          },
  };
}

describe("sync.push / sync.changes", () => {
  test("unauthenticated push is rejected; unauthenticated changes is empty", async () => {
    const t = setup();
    await expect(t.mutation(api.sync.push, { ops: [setOp()] })).rejects.toThrow(/Not signed in/);
    expect(await t.query(api.sync.changes, { since: 0 })).toEqual({ rows: [], seq: 0, hasMore: false });
  });

  test("B cannot read A's rows nor overwrite them by pushing the same cid", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await a.as.mutation(api.sync.push, { ops: [setOp({ cid: "shared" }, { reps: 5 })] });

    expect((await b.as.query(api.sync.changes, { since: 0 })).rows).toEqual([]);

    const res = await b.as.mutation(api.sync.push, {
      ops: [setOp({ cid: "shared", updatedAt: NOW + 1000 }, { reps: 99 })],
    });
    expect(res.rejected).toEqual([]);

    const aRows = (await a.as.query(api.sync.changes, { since: 0 })).rows;
    const bRows = (await b.as.query(api.sync.changes, { since: 0 })).rows;
    expect(aRows).toHaveLength(1);
    expect((aRows[0].data as SetData).reps).toBe(5);
    expect(bRows).toHaveLength(1);
    expect((bRows[0].data as SetData).reps).toBe(99);
    const all = await t.run((ctx) => ctx.db.query("userRows").collect());
    expect(all.map((r) => r.ownerId).sort()).toEqual([a.userId, b.userId].sort());
  });

  test("replaying the same op twice gives one row and one seq bump", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const op = setOp();
    const r1 = await a.as.mutation(api.sync.push, { ops: [op] });
    const r2 = await a.as.mutation(api.sync.push, { ops: [op] });
    expect(r1).toEqual({ applied: [op.opId], rejected: [], seq: 1 });
    expect(r2).toEqual({ applied: [op.opId], rejected: [], seq: 1 });
    // Same op twice in one batch too.
    const r3 = await a.as.mutation(api.sync.push, { ops: [op, op] });
    expect(r3.seq).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("userRows").collect())).toHaveLength(1);
  });

  test("stale op is ignored but reported as applied", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    await a.as.mutation(api.sync.push, { ops: [setOp({ updatedAt: NOW }, { reps: 8 })] });
    const stale = setOp({ updatedAt: NOW - 5000 }, { reps: 1 });
    const res = await a.as.mutation(api.sync.push, { ops: [stale] });
    expect(res).toEqual({ applied: [stale.opId], rejected: [], seq: 1 });
    const rows = (await a.as.query(api.sync.changes, { since: 0 })).rows;
    expect((rows[0].data as SetData).reps).toBe(8);
  });

  test("tombstone wins over an older edit and drops content", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    await a.as.mutation(api.sync.push, { ops: [setOp({ updatedAt: NOW })] });
    await a.as.mutation(api.sync.push, { ops: [setOp({ updatedAt: NOW + 10, deleted: true, data: null })] });
    // An older edit arriving late does not resurrect it.
    await a.as.mutation(api.sync.push, { ops: [setOp({ updatedAt: NOW + 5 }, { reps: 3 })] });
    const { rows, seq } = await a.as.query(api.sync.changes, { since: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deleted: true, data: null, seq: 2 });
    expect(seq).toBe(2);
    expect((await a.as.query(api.account.me, {}))!.counts.sets).toBe(0);
  });

  test("invalid ops are rejected individually", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const good = setOp({ cid: "ok" });
    const bad = [
      setOp({ cid: "r" }, { reps: 1001 }),
      setOp({ cid: "w" }, { weightKg: 1500 }),
      setOp({ cid: "f", updatedAt: Date.now() + 2 * 86_400_000 }),
      { ...setOp({ cid: "x" }), table: "exercises" } as unknown as SyncOp,
      { ...setOp({ cid: "y" }), data: { ...setOp().data!, extra: 1 } } as unknown as SyncOp,
      { ...setOp({ cid: "z" }), data: { ...setOp().data!, kind: "bogus" } } as unknown as SyncOp,
      setOp({ cid: "n", data: null }),
    ];
    const res = await a.as.mutation(api.sync.push, { ops: [good, ...bad] });
    expect(res.applied).toEqual([good.opId]);
    expect(res.rejected.map((r) => r.opId)).toEqual(bad.map((o) => o.opId));
    expect(res.seq).toBe(1);
  });

  test("batch larger than PUSH_BATCH_MAX throws", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const ops = Array.from({ length: 101 }, (_, i) => setOp({ cid: `c${i}` }));
    await expect(a.as.mutation(api.sync.push, { ops })).rejects.toThrow();
  });

  test("changes pages by seq with hasMore", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const ops = Array.from({ length: 25 }, (_, i) => setOp({ cid: `c${i}` }));
    await a.as.mutation(api.sync.push, { ops });
    const p1 = await a.as.query(api.sync.changes, { since: 0, limit: 10 });
    expect(p1.rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p1).toMatchObject({ hasMore: true, seq: 10 });
    const p2 = await a.as.query(api.sync.changes, { since: p1.seq, limit: 10 });
    expect(p2).toMatchObject({ hasMore: true, seq: 20 });
    const p3 = await a.as.query(api.sync.changes, { since: p2.seq, limit: 10 });
    expect(p3.rows).toHaveLength(5);
    expect(p3).toMatchObject({ hasMore: false, seq: 25 });
    const p4 = await a.as.query(api.sync.changes, { since: 25 });
    expect(p4).toEqual({ rows: [], seq: 25, hasMore: false });
  });

  test("set whose sessionCid contradicts its own sessionExercise is rejected", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    const se = {
      opId: "se-op",
      table: "sessionExercises" as const,
      cid: "se1",
      updatedAt: NOW,
      deleted: false,
      data: { sessionCid: "s1", exId: "ex_x", order: 0, slotId: null, substitutedFromExId: null, notes: "", restSec: null },
    };
    await a.as.mutation(api.sync.push, { ops: [se] });
    const res = await a.as.mutation(api.sync.push, { ops: [setOp({ cid: "bad" }, { sessionCid: "other" })] });
    expect(res.rejected).toHaveLength(1);
    // B's parent lookup never sees A's sessionExercise.
    const resB = await b.as.mutation(api.sync.push, { ops: [setOp({ cid: "bad" }, { sessionCid: "other" })] });
    expect(resB.rejected).toEqual([]);
  });
});
