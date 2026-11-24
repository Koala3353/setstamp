// Outgoing mail through a Google Apps Script web app.
//
// Convex Auth v2 sends its emails (sign-up validation, password recovery,
// security notices) by calling a mutation with the signature of Resend's
// `lib.sendEmail`. `sendEmail` below has that signature: it queues the email
// and schedules `deliver`, which POSTs JSON to MAIL_WEBHOOK_URL:
//
//   { to, subject, text, html, secret }   header: X-Mail-Secret: <secret>
//
// (Apps Script's doPost cannot read request headers, hence the `secret` field.)
// The webhook should answer 2xx; a JSON body with `ok: false` counts as failure.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { APP_NAME, genericEmail, htmlToText, passwordReset, renderEmail } from "./emailTemplates";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 20_000, 90_000];

/** Plain text → branded HTML (generic template). Kept for callers/tests. */
export function textToHtml(text: string): string {
  return genericEmail({ subject: APP_NAME, text }).html;
}

function siteUrl(): string | undefined {
  const url = env.SITE_URL?.replace(/\/+$/, "");
  return url || undefined;
}

export function mailConfig() {
  const url = env.MAIL_WEBHOOK_URL;
  const secret = env.MAIL_WEBHOOK_SECRET;
  return url && secret ? { url, secret } : null;
}

/** Same args/returns as `@convex-dev/resend`'s `lib.sendEmail`. */
export const sendEmail = internalMutation({
  args: {
    options: v.object({
      apiKey: v.string(),
      testMode: v.boolean(),
      initialBackoffMs: v.number(),
      retryAttempts: v.number(),
    }),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // Every email is re-rendered with the branded template (emailTemplates.ts).
    // The library's own html, if any, is replaced; links/codes are kept exactly.
    const rawText = args.text ?? (args.html ? htmlToText(args.html) : "");
    const { subject, text, html } = renderEmail({ subject: args.subject ?? "", text: rawText, siteUrl: siteUrl() });
    if (mailConfig() === null) {
      if (env.MAIL_DEV_LOG === "1") {
        // Dev only: lets sign-up/reset be tested before the webhook exists.
        console.log(`[mail:dev] to=${args.to.join(",")} subject=${subject}\n${text}`);
        return "dev-log";
      }
      // Throwing rolls back the calling auth mutation (e.g. startPasswordRecovery)
      // so nothing half-happens; sign-in itself never sends mail.
      throw new ConvexError({
        code: "EMAIL_NOT_CONFIGURED",
        message: "Email delivery is not configured (MAIL_WEBHOOK_URL / MAIL_WEBHOOK_SECRET are unset).",
      });
    }
    let firstId: string | null = null;
    for (const to of args.to) {
      const id = await ctx.db.insert("mailOutbox", { to, subject, text, html, attempts: 0 });
      await ctx.scheduler.runAfter(0, internal.mail.deliver, { id });
      firstId ??= id;
    }
    return firstId ?? "no-recipients";
  },
});

/**
 * Dev check of the real relay: sends the password-reset template with a dummy
 * link. Internal only: `npx convex run mail:sendTestEmail '{"to":"..."}'`.
 */
export const sendTestEmail = internalMutation({
  args: { to: v.string() },
  returns: v.id("mailOutbox"),
  handler: async (ctx, { to }) => {
    const base = siteUrl() ?? "http://localhost:5173";
    const mail = passwordReset({ link: `${base}/auth/reset-password?code=TEST-ONLY-NOT-A-REAL-CODE` });
    if (mailConfig() === null) {
      throw new ConvexError({ code: "EMAIL_NOT_CONFIGURED", message: "Email delivery is not configured." });
    }
    const id = await ctx.db.insert("mailOutbox", { to, ...mail, attempts: 0 });
    await ctx.scheduler.runAfter(0, internal.mail.deliver, { id });
    return id;
  },
});

export const getOutbox = internalQuery({
  args: { id: v.id("mailOutbox") },
  returns: v.union(
    v.null(),
    v.object({ to: v.string(), subject: v.string(), text: v.string(), html: v.string(), attempts: v.number() }),
  ),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;
    return { to: row.to, subject: row.subject, text: row.text, html: row.html, attempts: row.attempts };
  },
});

export const finishAttempt = internalMutation({
  args: { id: v.id("mailOutbox"), ok: v.boolean(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, ok, error }) => {
    const row = await ctx.db.get(id);
    if (row === null) return null;
    if (ok) {
      await ctx.db.delete(id);
      return null;
    }
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      console.error(`[mail] giving up after ${attempts} attempts: ${error ?? "unknown error"}`);
      await ctx.db.delete(id); // never keep links around
      return null;
    }
    console.warn(`[mail] attempt ${attempts} failed, retrying: ${error ?? "unknown error"}`);
    await ctx.db.patch(id, { attempts });
    await ctx.scheduler.runAfter(BACKOFF_MS[attempts] ?? 90_000, internal.mail.deliver, { id });
    return null;
  },
});

export const deliver = internalAction({
  args: { id: v.id("mailOutbox") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.mail.getOutbox, { id });
    if (row === null) return null;
    const cfg = mailConfig();
    if (cfg === null) {
      await ctx.runMutation(internal.mail.finishAttempt, {
        id,
        ok: false,
        error: "MAIL_WEBHOOK_URL / MAIL_WEBHOOK_SECRET are unset",
      });
      return null;
    }
    let ok = false;
    let error: string | undefined;
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mail-Secret": cfg.secret },
        body: JSON.stringify({ to: row.to, subject: row.subject, text: row.text, html: row.html, secret: cfg.secret }),
        redirect: "follow", // Apps Script /exec answers with a 302 to the result
      });
      const body = await res.text();
      ok = res.ok;
      if (ok) {
        try {
          const parsed = JSON.parse(body) as { ok?: unknown; error?: unknown };
          if (parsed && parsed.ok === false) {
            ok = false;
            error = `webhook replied ok:false ${String(parsed.error ?? "")}`.trim();
          }
        } catch {
          // Non-JSON 2xx reply counts as delivered.
        }
      } else {
        error = `HTTP ${res.status}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await ctx.runMutation(internal.mail.finishAttempt, { id, ok, error });
    return null;
  },
});
