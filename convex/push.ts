// Web Push for rest alerts: subscriptions per user and the one scheduled "rest over" push.
// Sending happens in pushSend.ts (Node runtime, web-push).
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentUserId, requireUserId } from "./users";

const MAX_SUBSCRIPTIONS = 10;
const MAX_REST_MS = 2 * 60 * 60 * 1000;
const MAX_LABEL = 80;

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

function checkEndpoint(endpoint: string) {
  if (endpoint.length > 1024) invalid("Endpoint too long");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    invalid("Endpoint is not a URL");
  }
  if (url.protocol !== "https:") invalid("Endpoint must be https");
}

/** VAPID public key for PushManager.subscribe, or null when push isn't set up on this deployment. */
export const config = query({
  args: {},
  returns: v.object({ publicKey: v.union(v.string(), v.null()) }),
  handler: async () => {
    const ok = !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY && !!env.VAPID_SUBJECT;
    return { publicKey: ok ? env.VAPID_PUBLIC_KEY! : null };
  },
});

/** Whether this browser's subscription is registered to the caller. */
export const isSubscribed = query({
  args: { endpoint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { endpoint }) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return false;
    const sub = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .first();
    return sub !== null && sub.userId === userId;
  },
});

export const saveSubscription = mutation({
  args: { endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }) },
  returns: v.null(),
  handler: async (ctx, { endpoint, keys }) => {
    const userId = await requireUserId(ctx);
    checkEndpoint(endpoint);
    if (keys.p256dh.length > 256 || keys.auth.length > 64 || !keys.p256dh || !keys.auth) invalid("Bad subscription keys");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .collect();
    // An endpoint belongs to one browser. If someone else signed in there before, it is now the
    // caller's device: their alerts must not keep going to it.
    for (const e of existing.slice(1)) await ctx.db.delete(e._id);
    if (existing[0]) {
      await ctx.db.patch(existing[0]._id, { userId, p256dh: keys.p256dh, auth: keys.auth });
      return null;
    }
    const mine = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Keep the newest few; old browsers that never unsubscribed age out.
    for (const old of mine.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, mine.length - MAX_SUBSCRIPTIONS + 1))) {
      await ctx.db.delete(old._id);
    }
    await ctx.db.insert("pushSubscriptions", { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, createdAt: Date.now() });
    return null;
  },
});

export const removeSubscription = mutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, { endpoint }) => {
    const userId = await requireUserId(ctx);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .collect();
    for (const s of subs) if (s.userId === userId) await ctx.db.delete(s._id);
    return null;
  },
});

async function cancelPending(ctx: MutationCtx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("restAlerts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    const job = await ctx.db.system.get(row.scheduledId);
    if (job && job.state.kind === "pending") await ctx.scheduler.cancel(row.scheduledId);
    await ctx.db.delete(row._id);
  }
}

/**
 * Schedule the "rest over" push for endsAt, replacing any earlier one. Returns false (and
 * schedules nothing) when the caller has no subscription, so the client relies on its local alert.
 * With `endpoint`, only that browser is alerted (the phone doing the workout, not every device).
 */
export const scheduleRestAlert = mutation({
  args: { endsAt: v.number(), label: v.string(), endpoint: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, { endsAt, label, endpoint }) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    if (!Number.isFinite(endsAt) || endsAt < now - 60_000 || endsAt > now + MAX_REST_MS) invalid("Rest end is out of range");
    if (label.length > MAX_LABEL) label = label.slice(0, MAX_LABEL);
    await cancelPending(ctx, userId);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const target = endpoint !== undefined ? subs.filter((s) => s.endpoint === endpoint) : subs;
    if (target.length === 0) return false;
    const scheduledId = await ctx.scheduler.runAt(Math.max(endsAt, now), internal.pushSend.sendRestAlert, {
      userId,
      label,
      endsAt,
      endpoint,
    });
    await ctx.db.insert("restAlerts", { userId, scheduledId, endsAt });
    return true;
  },
});

export const cancelRestAlert = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await cancelPending(ctx, userId);
    return null;
  },
});

/** Account deletion: subscriptions and any pending alert. */
export async function deletePushData(ctx: MutationCtx, userId: Id<"users">) {
  await cancelPending(ctx, userId);
  const subs = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const s of subs) await ctx.db.delete(s._id);
}

// --- Internal, for pushSend -------------------------------------------------

const vTarget = v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() });

export const targets = internalQuery({
  args: { userId: v.id("users"), endpoint: v.optional(v.string()) },
  returns: v.array(vTarget),
  handler: async (ctx, { userId, endpoint }) => {
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return subs
      .filter((s) => endpoint === undefined || s.endpoint === endpoint)
      .map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
  },
});

/** After sending: forget the alert row and drop endpoints the push service says are gone. */
export const afterSend = internalMutation({
  args: { userId: v.id("users"), endsAt: v.number(), gone: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { userId, endsAt, gone }) => {
    const rows = await ctx.db
      .query("restAlerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const r of rows) if (r.endsAt === endsAt) await ctx.db.delete(r._id);
    for (const endpoint of gone) {
      const subs = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .collect();
      for (const s of subs) if (s.userId === userId) await ctx.db.delete(s._id);
    }
    return null;
  },
});
