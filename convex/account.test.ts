import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { setup, signInAs } from "./test.setup";
import type { SyncOp } from "../src/shared/sync";

const fav = (cid: string, exId = "ex_squat"): SyncOp<"favorites"> => ({
  opId: crypto.randomUUID(),
  table: "favorites",
  cid,
  updatedAt: Date.now(),
  deleted: false,
  data: { exId },
});

describe("account", () => {
  test("me returns null when signed out and counts when signed in", async () => {
    const t = setup();
    expect(await t.query(api.account.me, {})).toBeNull();
    const a = await signInAs(t, "Alice");
    await a.as.mutation(api.sync.push, { ops: [fav("f1"), fav("f2")] });
    const me = await a.as.query(api.account.me, {});
    expect(me).toMatchObject({ name: "Alice", email: null, signInMethod: "emailPassword" });
    expect(me!.counts.favorites).toBe(2);
  });

  test("export contains only the caller's rows and no catalog", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await a.as.mutation(api.sync.push, { ops: [fav("a1"), fav("a2")] });
    await b.as.mutation(api.sync.push, { ops: [fav("b1")] });
    await t.run((ctx) =>
      ctx.db.insert("catalogMeta", { key: "catalog", version: "v1", builtAt: "x", counts: {}, sources: {}, importedAt: 0 }),
    );
    const out = await a.as.action(api.account.exportData, {});
    expect(out.rows.map((r) => r.cid).sort()).toEqual(["a1", "a2"]);
    expect(out.catalogVersion).toBe("v1");
    expect(Object.keys(out)).not.toContain("exercises");
    await expect(t.action(api.account.exportData, {})).rejects.toThrow(/Not signed in/);
  });

  test("deleteAllData removes only the caller's rows; seq stays monotonic", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await a.as.mutation(api.sync.push, { ops: [fav("a1"), fav("a2")] });
    await b.as.mutation(api.sync.push, { ops: [fav("b1")] });
    await a.as.mutation(api.account.deleteAllData, {});
    await t.finishAllScheduledFunctions(() => {});
    const rows = await t.run((ctx) => ctx.db.query("userRows").collect());
    expect(rows.map((r) => r.cid)).toEqual(["b1"]);
    expect((await a.as.query(api.account.me, {}))!.counts.favorites).toBe(0);
    // Pushing again after the wipe works and continues the seq.
    const res = await a.as.mutation(api.sync.push, { ops: [fav("a1")] });
    expect(res.seq).toBe(3);
    expect((await a.as.query(api.sync.changes, { since: 0 })).rows.map((r) => r.cid)).toEqual(["a1"]);
    // Idempotent.
    await a.as.mutation(api.account.deleteAllData, {});
    await a.as.mutation(api.account.deleteAllData, {});
  });

  test("deleteAllData purges large data sets across scheduled batches", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    for (let i = 0; i < 12; i++) {
      await a.as.mutation(api.sync.push, {
        ops: Array.from({ length: 100 }, (_, j) => fav(`f${i}-${j}`)),
      });
    }
    await a.as.mutation(api.account.deleteAllData, {});
    // Rows awaiting the purge are already invisible.
    expect((await a.as.query(api.sync.changes, { since: 0 })).rows).toEqual([]);
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run((ctx) => ctx.db.query("userRows").collect())).toHaveLength(0);
  });

  test("deleteAccount removes data, user and sessions; other users untouched", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await a.as.mutation(api.sync.push, { ops: [fav("a1")] });
    await b.as.mutation(api.sync.push, { ops: [fav("b1")] });
    await a.as.mutation(api.account.deleteAccount, {});
    await t.finishAllScheduledFunctions(() => {});
    expect(await a.as.query(api.auth.isAuthenticated, {})).toBe(false);
    expect(await a.as.query(api.account.me, {})).toBeNull();
    await expect(a.as.mutation(api.sync.push, { ops: [fav("a2")] })).rejects.toThrow(/Not signed in/);
    await expect(a.as.mutation(api.account.deleteAccount, {})).rejects.toThrow(/Not signed in/);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users.map((u) => u._id)).toEqual([b.userId]);
    const rows = await t.run((ctx) => ctx.db.query("userRows").collect());
    expect(rows.map((r) => r.cid)).toEqual(["b1"]);
    const states = await t.run((ctx) => ctx.db.query("syncState").collect());
    expect(states.map((s) => s.ownerId)).toEqual([b.userId]);
    expect(await b.as.query(api.auth.isAuthenticated, {})).toBe(true);
  });
});
