// Shared exercise catalog. Read-only to users: the only writer is the
// internal `importBatch`, run from scripts/import-catalog.ts via the CLI.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { vCatalogExercise } from "./validators";

const PAGE_MAX = 500;

export const meta = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ version: v.string(), builtAt: v.string(), counts: v.any() }),
  ),
  handler: async (ctx) => {
    const m = await ctx.db
      .query("catalogMeta")
      .withIndex("by_key", (q) => q.eq("key", "catalog"))
      .unique();
    if (m === null) return null;
    return { version: m.version, builtAt: m.builtAt, counts: m.counts };
  },
});

/**
 * All catalog rows (active and merged; merged rows keep old exIds resolvable),
 * in exId order. Clients cache the result and refetch only when `meta.version`
 * changes.
 */
export const page = query({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  returns: v.object({
    page: v.array(vCatalogExercise),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { cursor, numItems }) => {
    const n = Math.min(PAGE_MAX, Math.max(1, Math.floor(Number.isFinite(numItems) ? numItems : PAGE_MAX)));
    const res = await ctx.db
      .query("exercises")
      .withIndex("by_exId")
      .order("asc")
      .paginate({ cursor, numItems: n });
    return {
      page: res.page.map(({ _id, _creationTime, ...ex }) => ex),
      isDone: res.isDone,
      continueCursor: res.continueCursor,
    };
  },
});

const vMetaArg = v.object({
  version: v.string(),
  builtAt: v.string(),
  counts: v.any(),
  sources: v.any(),
  curated: v.optional(v.any()),
  schema: v.optional(v.number()),
});

/** Upsert by exId. Never deletes; status/mergedInto are taken from the input. */
export const importBatch = internalMutation({
  args: { exercises: v.array(vCatalogExercise), meta: v.optional(vMetaArg) },
  returns: v.object({ inserted: v.number(), updated: v.number(), unchanged: v.number() }),
  handler: async (ctx, { exercises, meta }) => {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    for (const ex of exercises) {
      if (ex.status === "merged" && !ex.mergedInto) throw new Error(`${ex.exId}: merged without mergedInto`);
      if (ex.status === "active" && ex.mergedInto !== null) throw new Error(`${ex.exId}: active with mergedInto`);
      if (ex.mergedInto === ex.exId) throw new Error(`${ex.exId}: merged into itself`);
      const existing = await ctx.db
        .query("exercises")
        .withIndex("by_exId", (q) => q.eq("exId", ex.exId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("exercises", ex);
        inserted++;
      } else {
        const { _id, _creationTime, ...current } = existing;
        if (JSON.stringify(current) === JSON.stringify({ ...current, ...ex })) {
          unchanged++;
        } else {
          await ctx.db.replace(_id, ex);
          updated++;
        }
      }
    }
    if (meta) {
      const doc = { key: "catalog" as const, ...meta, importedAt: Date.now() };
      const existing = await ctx.db
        .query("catalogMeta")
        .withIndex("by_key", (q) => q.eq("key", "catalog"))
        .unique();
      if (existing) await ctx.db.replace(existing._id, doc);
      else await ctx.db.insert("catalogMeta", doc);
    }
    return { inserted, updated, unchanged };
  },
});
