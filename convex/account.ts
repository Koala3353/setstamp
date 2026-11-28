// Account info, export, and deletion. Everything is scoped to the caller.
import { ConvexError, v, type Infer } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { vRowCounts } from "./schema";
import { emptyCounts } from "./sync";
import { currentUserId, requireUserId } from "./users";
import { vRowData, vSyncTable } from "./validators";
import { mailConfig } from "./mail";
import { deletePushData } from "./push";

const PURGE_BATCH = 500;
const EXPORT_PAGE = 1000;

/** Which sign-in options are usable on this deployment (no secrets exposed). */
export const authConfig = query({
  args: {},
  returns: v.object({ google: v.boolean(), passwordReset: v.boolean() }),
  handler: async () => {
    const id = env.AUTH_GOOGLE_ID;
    const google = !!id && id !== "unset" && !!env.AUTH_GOOGLE_SECRET && env.AUTH_GOOGLE_SECRET !== "unset";
    return { google, passwordReset: mailConfig() !== null || env.MAIL_DEV_LOG === "1" };
  },
});

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      createdAt: v.number(),
      signInMethod: v.string(),
      counts: vRowCounts,
    }),
  ),
  handler: async (ctx) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return null;
    const user = (await ctx.db.get(userId))!;
    const verifiedEmail = await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, { userId });
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    return {
      userId,
      email: verifiedEmail ?? user.email ?? null,
      name: user.name ?? null,
      createdAt: user._creationTime,
      signInMethod: user.createdBy,
      counts: { ...emptyCounts(), ...(state?.counts ?? {}) },
    };
  },
});

// --- Export -----------------------------------------------------------------

const vExportRow = v.object({
  table: vSyncTable,
  cid: v.string(),
  updatedAt: v.number(),
  deleted: v.boolean(),
  seq: v.number(),
  data: vRowData,
});

const vExportPage = v.object({ rows: v.array(vExportRow), done: v.boolean(), lastSeq: v.number() });

export const exportPage = internalQuery({
  args: { ownerId: v.id("users"), afterSeq: v.number() },
  returns: vExportPage,
  handler: async (ctx, { ownerId, afterSeq }) => {
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const floor = Math.max(afterSeq, state?.purgedThrough ?? 0);
    const page = await ctx.db
      .query("userRows")
      .withIndex("by_owner_seq", (q) => q.eq("ownerId", ownerId).gt("seq", floor))
      .take(EXPORT_PAGE + 1);
    const rows = page.slice(0, EXPORT_PAGE).map((r) => ({
      table: r.table,
      cid: r.cid,
      updatedAt: r.updatedAt,
      deleted: r.deleted,
      seq: r.seq,
      data: r.data,
    }));
    return { rows, done: page.length <= EXPORT_PAGE, lastSeq: rows.length ? rows[rows.length - 1].seq : floor };
  },
});

const vExportProfile = v.union(
  v.null(),
  v.object({
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    createdAt: v.number(),
    catalogVersion: v.union(v.string(), v.null()),
  }),
);

export const exportProfile = internalQuery({
  args: { userId: v.id("users") },
  returns: vExportProfile,
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const email = await ctx.runQuery(components.authEmail.verifiedEmails.getPrimaryEmail, { userId });
    const meta = await ctx.db
      .query("catalogMeta")
      .withIndex("by_key", (q) => q.eq("key", "catalog"))
      .unique();
    return {
      email: email ?? user.email ?? null,
      name: user.name ?? null,
      createdAt: user._creationTime,
      catalogVersion: meta?.version ?? null,
    };
  },
});

/** All of the caller's own rows (tombstones included) as JSON. Never the catalog. */
const vExportResult = v.object({
  format: v.literal("gym-app-export/1"),
  exportedAt: v.number(),
  catalogVersion: v.union(v.string(), v.null()),
  account: v.object({ email: v.union(v.string(), v.null()), name: v.union(v.string(), v.null()), createdAt: v.number() }),
  rows: v.array(vExportRow),
});

export const exportData = action({
  args: {},
  returns: vExportResult,
  handler: async (ctx): Promise<Infer<typeof vExportResult>> => {
    // ActionCtx.runQuery's generic signature differs from what getAuthUserId declares.
    const userId = await getAuthUserId(ctx as unknown as Parameters<typeof getAuthUserId>[0]);
    if (userId === null) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    const profile: Infer<typeof vExportProfile> = await ctx.runQuery(internal.account.exportProfile, { userId });
    if (profile === null) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
    const rows: Infer<typeof vExportRow>[] = [];
    let afterSeq = 0;
    for (;;) {
      const page: Infer<typeof vExportPage> = await ctx.runQuery(internal.account.exportPage, { ownerId: userId, afterSeq });
      rows.push(...page.rows);
      if (page.done) break;
      afterSeq = page.lastSeq;
    }
    const { catalogVersion, ...account } = profile;
    return { format: "gym-app-export/1" as const, exportedAt: Date.now(), catalogVersion, account, rows };
  },
});

// --- Deletion ---------------------------------------------------------------

/**
 * Delete the owner's rows with seq <= upToSeq (all rows when upToSeq is null),
 * a batch at a time, rescheduling itself until none are left. Idempotent.
 */
async function purgeBatch(ctx: MutationCtx, ownerId: Id<"users">, upToSeq: number | null) {
  const batch = await ctx.db
    .query("userRows")
    .withIndex("by_owner_seq", (q) =>
      upToSeq === null ? q.eq("ownerId", ownerId) : q.eq("ownerId", ownerId).lte("seq", upToSeq),
    )
    .take(PURGE_BATCH);
  for (const row of batch) await ctx.db.delete(row._id);
  if (batch.length === PURGE_BATCH) {
    await ctx.scheduler.runAfter(0, internal.account.purgeRows, { ownerId, upToSeq });
  }
}

export const purgeRows = internalMutation({
  args: { ownerId: v.id("users"), upToSeq: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { ownerId, upToSeq }) => {
    await purgeBatch(ctx, ownerId, upToSeq);
    return null;
  },
});

/** Delete all of the caller's synced data; the account stays. */
export const deleteAllData = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    // Rest-alert subscriptions go too; the lifter can turn alerts on again in Settings.
    await deletePushData(ctx, ownerId);
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (state === null) return null; // never synced anything
    // seq stays monotonic so other devices' cursors keep working; rows at or
    // below the watermark are invisible to push/changes until purged.
    await ctx.db.patch(state._id, { counts: emptyCounts(), purgedThrough: state.seq });
    await purgeBatch(ctx, ownerId, state.seq);
    return null;
  },
});

/** Delete the caller's data, credentials, sessions and user record. */
export const deleteAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const user = (await ctx.db.get(userId))!;

    // 1. Sessions: every device is signed out.
    const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId });
    if (sessions.length) {
      await ctx.runMutation(components.auth.public.revokeSessions, {
        sessionIds: sessions.map((s) => s.sessionId),
      });
    }
    // 2. Sign-in identities.
    await ctx.runMutation(components.authEmail.verifiedEmails.deleteUser, { userId });
    await ctx.runMutation(components.authGoogle.provider.deleteUser, { userId });
    if (user.createdBy === "emailPassword") {
      // The password component has no delete; overwrite the hash with a
      // random unknowable password so no usable credential remains.
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      await ctx.runMutation(components.authPassword.public._internal_dangerous_setPassword, {
        userId,
        password: random,
        minimumLength: 10,
      });
    }
    // 3. App data.
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .unique();
    if (state) await ctx.db.delete(state._id);
    await purgeBatch(ctx, userId, null);
    await deletePushData(ctx, userId);
    // 4. The user record; any still-valid access token now resolves to nobody.
    await ctx.db.delete(userId);
    return null;
  },
});
