import { v } from "convex/values";
import { vGoogleProfile } from "@convex-dev/auth/methods/google/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";

/** Caller's user id, or null when signed out (session gone/expired included). */
export async function currentUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  // The users row can be gone (account deleted while a token is still valid).
  const user = await ctx.db.get(userId);
  return user === null ? null : userId;
}

/** Caller's user id; throws ConvexError UNAUTHENTICATED when signed out. */
export async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await currentUserId(ctx);
  if (userId === null) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not signed in" });
  return userId;
}

// --- Convex Auth user callbacks (internal; called by the auth core) ---------

export const createUserEmailPassword = internalMutation({
  args: {
    method: v.object({ name: v.literal("emailPassword"), profile: v.object({}) }),
  },
  returns: v.id("users"),
  handler: async (ctx) => {
    // The email lives in the authEmail component (verified addresses only).
    return await ctx.db.insert("users", { createdBy: "emailPassword" });
  },
});

export const createUserGoogle = internalMutation({
  args: {
    method: v.object({ name: v.literal("google"), profile: vGoogleProfile }),
  },
  returns: v.id("users"),
  handler: async (ctx, { method }) => {
    const p = method.profile;
    return await ctx.db.insert("users", {
      createdBy: "google",
      name: p.name,
      email: p.emailVerified ? p.email : undefined,
      image: p.picture,
    });
  },
});

export const onSignInGoogle = internalMutation({
  args: {
    method: v.object({ name: v.literal("google"), profile: vGoogleProfile }),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { method, userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null) throw new ConvexError({ code: "ACCOUNT_DELETED", message: "This account was deleted" });
    const p = method.profile;
    await ctx.db.patch(userId, {
      name: p.name ?? user.name,
      email: p.emailVerified && p.email ? p.email : user.email,
      image: p.picture ?? user.image,
    });
    return null;
  },
});
