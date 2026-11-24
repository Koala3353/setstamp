// Sync protocol: see src/shared/sync.ts for the contract.
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { CHANGES_PAGE, PUSH_BATCH_MAX, SYNC_TABLES, type SyncTable } from "../src/shared/sync";
import { checkValue, dataValidators, vRowData, vSyncTable } from "./validators";
import { currentUserId, requireUserId } from "./users";
import type { Infer } from "convex/values";
import type { vRowCounts } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ID_LEN = 128;
const MAX_DATA_BYTES = 256 * 1024;

type RowCounts = Infer<typeof vRowCounts>;
export const emptyCounts = (): RowCounts =>
  Object.fromEntries(SYNC_TABLES.map((t) => [t, 0])) as RowCounts;

// Ops are validated per-op in the handler so one bad op never fails the batch.
const vOp = v.object({
  opId: v.string(),
  table: v.string(),
  cid: v.string(),
  updatedAt: v.number(),
  deleted: v.boolean(),
  data: v.any(),
});

const vPushResult = v.object({
  applied: v.array(v.string()),
  rejected: v.array(v.object({ opId: v.string(), reason: v.string() })),
  seq: v.number(),
});

const vSyncRow = v.object({
  table: vSyncTable,
  cid: v.string(),
  updatedAt: v.number(),
  deleted: v.boolean(),
  seq: v.number(),
  data: vRowData,
});

const vChangesResult = v.object({ rows: v.array(vSyncRow), seq: v.number(), hasMore: v.boolean() });

const isId = (s: unknown) => typeof s === "string" && s.length > 0 && s.length <= MAX_ID_LEN;
const inRange = (x: number | null | undefined, min: number, max: number) =>
  x === null || x === undefined || (x >= min && x <= max);

/** Plausibility limits beyond the shape check. Returns a reason or null. */
function checkLimits(table: SyncTable, data: Record<string, unknown>): string | null {
  const d = data as any; // shape already verified by checkValue
  switch (table) {
    case "sets": {
      if (!inRange(d.reps, 0, 1000)) return "reps out of range (0-1000)";
      if (!inRange(d.weightKg, 0, 1000)) return "weightKg out of range (0-1000)";
      if (!inRange(d.assistKg, 0, 1000)) return "assistKg out of range (0-1000)";
      if (d.entered) {
        const kg = d.entered.unit === "kg" ? d.entered.value : d.entered.value / 2.2046226218;
        if (!inRange(kg, 0, 1000)) return "entered weight out of range";
      }
      if (!inRange(d.durationSec, 0, 86_400)) return "durationSec out of range";
      if (!inRange(d.distanceM, 0, 1_000_000)) return "distanceM out of range";
      if (!inRange(d.rpe, 0, 10)) return "rpe out of range (0-10)";
      if (!inRange(d.order, 0, 10_000)) return "order out of range";
      if (!isId(d.sessionCid) || !isId(d.sessionExerciseCid)) return "invalid parent cid";
      return null;
    }
    case "sessionExercises":
      if (!inRange(d.order, 0, 10_000)) return "order out of range";
      if (!inRange(d.restSec, 0, 3600)) return "restSec out of range";
      if (!isId(d.sessionCid)) return "invalid sessionCid";
      if (d.groupId != null && !isId(d.groupId)) return "invalid groupId";
      return null;
    case "sessions":
      if (!inRange(d.bodyweightKg, 0, 700)) return "bodyweightKg out of range";
      if (d.endedAt !== null && d.endedAt < d.startedAt) return "endedAt before startedAt";
      return null;
    case "settings": {
      if (!inRange(d.bodyweightKg, 0, 700)) return "bodyweightKg out of range";
      if (!inRange(d.defaultRestSec, 0, 3600)) return "defaultRestSec out of range";
      if (!inRange(d.barKg, 0, 100)) return "barKg out of range";
      if (d.platesKg.length > 50 || d.platesKg.some((p: number) => !inRange(p, 0, 100))) return "platesKg out of range";
      if (!inRange(d.sessionMinutes, 0, 1440)) return "sessionMinutes out of range";
      return null;
    }
    case "programs": {
      if (d.days.length > 50) return "too many days";
      if (!inRange(d.nextDayIndex, 0, Math.max(0, d.days.length))) return "nextDayIndex out of range";
      if (d.preferredWeekdays.some((w: number) => !Number.isInteger(w) || w < 0 || w > 6)) return "invalid weekday";
      for (const day of d.days) {
        if (day.slots.length > 100) return "too many slots";
        for (const s of day.slots) {
          if (!inRange(s.sets, 0, 100)) return "slot sets out of range";
          if (!inRange(s.repMin, 0, 1000) || !inRange(s.repMax, 0, 1000)) return "slot reps out of range";
          if (!inRange(s.restSec, 0, 3600) || !inRange(s.durationSec, 0, 86_400)) return "slot time out of range";
          if (s.groupId != null && !isId(s.groupId)) return "invalid slot groupId";
        }
      }
      return null;
    }
    default:
      return null;
  }
}

async function getRow(ctx: MutationCtx, ownerId: Id<"users">, table: SyncTable, cid: string) {
  // Always scoped by ownerId: a cid never resolves to another user's row.
  return await ctx.db
    .query("userRows")
    .withIndex("by_owner_table_cid", (q) => q.eq("ownerId", ownerId).eq("table", table).eq("cid", cid))
    .unique();
}

export const push = mutation({
  args: { ops: v.array(vOp) },
  returns: vPushResult,
  handler: async (ctx, { ops }) => {
    const ownerId = await requireUserId(ctx);
    if (ops.length > PUSH_BATCH_MAX) {
      throw new ConvexError({ code: "BATCH_TOO_LARGE", message: `At most ${PUSH_BATCH_MAX} ops per push` });
    }

    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    let seq = state?.seq ?? 0;
    const purgedThrough = state?.purgedThrough ?? 0;
    const counts = { ...emptyCounts(), ...(state?.counts ?? {}) };
    const startSeq = seq;
    let countsChanged = false;

    const applied: string[] = [];
    const rejected: Array<{ opId: string; reason: string }> = [];
    const now = Date.now();

    for (const op of ops) {
      const reject = (reason: string) => rejected.push({ opId: String(op.opId).slice(0, MAX_ID_LEN), reason });
      if (!isId(op.opId)) {
        reject("invalid opId");
        continue;
      }
      if (!(SYNC_TABLES as readonly string[]).includes(op.table)) {
        reject("unknown table");
        continue;
      }
      const table = op.table as SyncTable;
      if (!isId(op.cid)) {
        reject("invalid cid");
        continue;
      }
      if (!Number.isFinite(op.updatedAt) || op.updatedAt < 0) {
        reject("invalid updatedAt");
        continue;
      }
      if (op.updatedAt > now + DAY_MS) {
        reject("updatedAt is in the future");
        continue;
      }

      let data: Doc<"userRows">["data"] = null;
      if (!op.deleted) {
        if (op.data === null || op.data === undefined) {
          reject("data required unless deleted");
          continue;
        }
        const shapeErr = checkValue(dataValidators[table], op.data);
        if (shapeErr) {
          reject(shapeErr);
          continue;
        }
        if (JSON.stringify(op.data).length > MAX_DATA_BYTES) {
          reject("data too large");
          continue;
        }
        const limitErr = checkLimits(table, op.data);
        if (limitErr) {
          reject(limitErr);
          continue;
        }
        data = op.data;
      }
      // Tombstones keep no content: data is always stored as null.

      let existing = await getRow(ctx, ownerId, table, op.cid);
      if (existing !== null && existing.seq <= purgedThrough) {
        // Left over from deleteAllData (purge still running): treat as gone.
        await ctx.db.delete(existing._id);
        existing = null;
      }

      if (table === "sets" && data !== null && "sessionExerciseCid" in data) {
        // Parent consistency, resolved only within the caller's own rows.
        const parent = await getRow(ctx, ownerId, "sessionExercises", data.sessionExerciseCid);
        if (parent && parent.seq > purgedThrough && !parent.deleted && parent.data && "sessionCid" in parent.data && parent.data.sessionCid !== data.sessionCid) {
          reject("sessionCid does not match its sessionExercise");
          continue;
        }
      }

      if (existing === null) {
        seq += 1;
        await ctx.db.insert("userRows", {
          ownerId,
          table,
          cid: op.cid,
          updatedAt: op.updatedAt,
          deleted: op.deleted,
          seq,
          data,
        });
        if (!op.deleted) {
          counts[table] += 1;
          countsChanged = true;
        }
      } else if (op.updatedAt > existing.updatedAt) {
        seq += 1;
        await ctx.db.patch(existing._id, { updatedAt: op.updatedAt, deleted: op.deleted, seq, data });
        if (existing.deleted !== op.deleted) {
          counts[table] += op.deleted ? -1 : 1;
          countsChanged = true;
        }
      }
      // else: stale (or exact replay) — resolved, nothing to write.
      applied.push(op.opId);
    }

    if (seq !== startSeq || countsChanged || state === null) {
      if (state === null) {
        await ctx.db.insert("syncState", { ownerId, seq, counts });
      } else {
        await ctx.db.patch(state._id, { seq, counts });
      }
    }
    return { applied, rejected, seq };
  },
});

export const changes = query({
  args: { since: v.number(), limit: v.optional(v.number()) },
  returns: vChangesResult,
  handler: async (ctx, { since, limit }) => {
    const ownerId = await currentUserId(ctx);
    if (ownerId === null) return { rows: [], seq: 0, hasMore: false };
    const from = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
    const n = Math.min(CHANGES_PAGE, Math.max(1, Math.floor(Number.isFinite(limit) ? limit! : CHANGES_PAGE)));

    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const floor = Math.max(from, state?.purgedThrough ?? 0);
    const page = await ctx.db
      .query("userRows")
      .withIndex("by_owner_seq", (q) => q.eq("ownerId", ownerId).gt("seq", floor))
      .order("asc")
      .take(n + 1);
    const hasMore = page.length > n;
    const rows = page.slice(0, n).map((r) => ({
      table: r.table,
      cid: r.cid,
      updatedAt: r.updatedAt,
      deleted: r.deleted,
      seq: r.seq,
      data: r.data,
    }));
    let seq: number;
    if (hasMore) {
      seq = rows[rows.length - 1].seq;
    } else {
      seq = Math.max(from, state?.seq ?? 0, rows.length ? rows[rows.length - 1].seq : 0);
    }
    return { rows, seq, hasMore };
  },
});
