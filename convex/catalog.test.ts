import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { modules, setup, signInAs } from "./test.setup";
import type { CatalogExercise } from "../src/shared/domain";

const ex = (exId: string, over: Partial<CatalogExercise> = {}): CatalogExercise => ({
  exId,
  name: exId,
  aliases: [],
  equipment: ["barbell"],
  primary: ["chest"],
  secondary: [],
  pattern: "horizontal_push",
  mechanic: "compound",
  tracking: "weight_reps",
  unilateral: false,
  level: null,
  commonness: 3,
  family: null,
  instructions: [],
  images: [],
  sources: [{ source: "curated", sourceId: exId, version: "v1" }],
  status: "active",
  mergedInto: null,
  ...over,
});
const meta = (version: string) => ({ version, builtAt: "2026-11-23", counts: { active: 2 }, sources: {} });

describe("catalog", () => {
  test("import upserts by exId, keeps ids stable, never deletes; merged rows stay resolvable", async () => {
    const t = setup();
    expect(await t.query(api.catalog.meta, {})).toBeNull();
    const r1 = await t.mutation(internal.catalog.importBatch, {
      exercises: [ex("ex_bench"), ex("ex_bench_flat")],
      meta: meta("v1"),
    });
    expect(r1).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    const before = await t.run((ctx) => ctx.db.query("exercises").collect());

    // Re-import: one renamed, one merged; the other is absent from the batch.
    const r2 = await t.mutation(internal.catalog.importBatch, {
      exercises: [ex("ex_bench", { name: "Bench press" }), ex("ex_bench_flat", { status: "merged", mergedInto: "ex_bench" })],
      meta: meta("v2"),
    });
    expect(r2).toEqual({ inserted: 0, updated: 2, unchanged: 0 });
    const r3 = await t.mutation(internal.catalog.importBatch, { exercises: [ex("ex_bench", { name: "Bench press" })] });
    expect(r3).toEqual({ inserted: 0, updated: 0, unchanged: 1 });

    const after = await t.run((ctx) => ctx.db.query("exercises").collect());
    expect(after.map((d) => [d.exId, d._id])).toEqual(before.map((d) => [d.exId, d._id]));
    expect((await t.query(api.catalog.meta, {}))!.version).toBe("v2");

    const page = await t.query(api.catalog.page, { cursor: null, numItems: 500 });
    expect(page.isDone).toBe(true);
    const flat = page.page.find((e) => e.exId === "ex_bench_flat")!;
    expect(flat).toMatchObject({ status: "merged", mergedInto: "ex_bench" });
    expect(page.page.find((e) => e.exId === "ex_bench")!.name).toBe("Bench press");
    expect(Object.keys(flat)).not.toContain("_id");
  });

  test("page is paginated and capped at 500", async () => {
    const t = setup();
    await t.mutation(internal.catalog.importBatch, {
      exercises: Array.from({ length: 30 }, (_, i) => ex(`ex_${String(i).padStart(2, "0")}`)),
    });
    const p1 = await t.query(api.catalog.page, { cursor: null, numItems: 20 });
    expect(p1.page).toHaveLength(20);
    expect(p1.isDone).toBe(false);
    const p2 = await t.query(api.catalog.page, { cursor: p1.continueCursor, numItems: 20 });
    expect(p2.page).toHaveLength(10);
    expect([...p1.page, ...p2.page].map((e) => e.exId)).toEqual(Array.from({ length: 30 }, (_, i) => `ex_${String(i).padStart(2, "0")}`));
  });

  test("no public function writes the catalog", async () => {
    const t = setup();
    // Every public mutation/action in the app, found by inspecting the registered
    // functions. A new public writer fails this test until reviewed and listed.
    const publicWriters: string[] = [];
    for (const [file, load] of Object.entries(modules)) {
      if (/_generated|test\.setup|\.config\.ts$/.test(file)) continue;
      const mod = (await load()) as Record<string, { isPublic?: boolean; isMutation?: boolean; isAction?: boolean }>;
      for (const [name, fn] of Object.entries(mod)) {
        if (fn && fn.isPublic && (fn.isMutation || fn.isAction)) {
          publicWriters.push(`${file.replace(/^\.\//, "").replace(/\.ts$/, "")}.${name}`);
        }
      }
    }
    expect(publicWriters.sort()).toEqual(
      [
        "account.deleteAccount",
        "account.deleteAllData",
        "account.exportData",
        "auth.changePassword",
        "auth.completeChangeEmail",
        "auth.completePasswordRecovery",
        "auth.completeSignInWithGoogle",
        "auth.completeSignUpWithEmailPassword",
        "auth.refreshSession",
        "auth.signInWithEmailPassword",
        "auth.signOut",
        "auth.signUpWithEmailPassword",
        "auth.startChangeEmail",
        "auth.startPasswordRecovery",
        "auth.startSignInWithGoogle",
        "push.cancelRestAlert",
        "push.removeSubscription",
        "push.saveSubscription",
        "push.scheduleRestAlert",
        "sync.push",
      ].sort(),
    );
    // None of them is in the catalog module, and importBatch is internal.
    const catalogMod = (await modules["./catalog.ts"]()) as Record<string, { isInternal?: boolean }>;
    expect(catalogMod.importBatch.isInternal).toBe(true);

    // Pushing a catalog-like table through sync is rejected and touches nothing.
    const a = await signInAs(t, "A");
    const res = await a.as.mutation(api.sync.push, {
      ops: [{ opId: "o1", table: "exercises", cid: "ex_bench", updatedAt: Date.now(), deleted: false, data: ex("ex_bench") }],
    });
    expect(res.rejected).toEqual([{ opId: "o1", reason: "unknown table" }]);
    expect(await t.run((ctx) => ctx.db.query("exercises").collect())).toHaveLength(0);
  });
});
