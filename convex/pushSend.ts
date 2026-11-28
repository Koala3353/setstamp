"use node";
// Sends the scheduled "rest over" Web Push (scheduled by push.scheduleRestAlert).
import webpush from "web-push";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

export const sendRestAlert = internalAction({
  args: { userId: v.id("users"), label: v.string(), endsAt: v.number(), endpoint: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { userId, label, endsAt, endpoint }) => {
    const publicKey = env.VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;
    const subject = env.VAPID_SUBJECT;
    const gone: string[] = [];
    if (publicKey && privateKey && subject) {
      const targets = await ctx.runQuery(internal.push.targets, { userId, endpoint });
      // Read by public/rest-push-sw.js.
      const payload = JSON.stringify({ type: "rest-over", title: "Rest over", body: label || "Time for your next set.", endsAt });
      await Promise.all(
        targets.map(async (t) => {
          try {
            await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
              vapidDetails: { subject, publicKey, privateKey },
              // A rest alert is worthless a couple of minutes late; a newer one replaces an undelivered one.
              TTL: 120,
              urgency: "high",
              topic: "rest-over",
            });
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) gone.push(t.endpoint);
            else console.warn("rest alert push failed", status ?? String(e));
          }
        }),
      );
    }
    await ctx.runMutation(internal.push.afterSend, { userId, endsAt, gone });
    return null;
  },
});
