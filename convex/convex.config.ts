import { defineApp } from "convex/server";
import { v } from "convex/values";
import auth from "@convex-dev/auth/convex.config";
import authEmail from "@convex-dev/auth/components/email/convex.config";
import authPassword from "@convex-dev/auth/components/password/convex.config";
import authGoogle from "@convex-dev/auth/components/google/convex.config";

const app = defineApp({
  env: {
    // Google OAuth client. The Google component requires both values, so they
    // must exist on every deployment; until the real client exists they hold
    // the placeholder "unset" (see account.authConfig, which reports Google as
    // disabled while that is the case).
    AUTH_GOOGLE_ID: v.string(),
    AUTH_GOOGLE_SECRET: v.string(),
    // Frontend origin used for emailed links and OAuth redirect allow-list.
    SITE_URL: v.optional(v.string()),
    // Extra allowed OAuth redirect origins, comma-separated.
    AUTH_EXTRA_ORIGINS: v.optional(v.string()),
    // Google Apps Script mail webhook.
    MAIL_WEBHOOK_URL: v.optional(v.string()),
    MAIL_WEBHOOK_SECRET: v.optional(v.string()),
    // "1" on dev only: with no webhook configured, log emails instead of failing.
    MAIL_DEV_LOG: v.optional(v.string()),
    // Web Push (rest alerts). Without the keys, push is reported as unavailable to the client.
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    VAPID_SUBJECT: v.optional(v.string()),
  },
});

// Core (sessions/tokens) must be mounted as `auth`.
app.use(auth);
app.use(authEmail);
app.use(authPassword);
app.use(authGoogle, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_SECRET,
  },
});

export default app;
