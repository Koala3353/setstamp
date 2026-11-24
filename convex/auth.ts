// Convex Auth v2.1 wiring: email+password (with validation + recovery) and Google.
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { GoogleProfile } from "@convex-dev/auth/methods/google/server";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env } from "./_generated/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupEmailPassword } from "@convex-dev/auth/methods/email-password/server";
import { setupGoogle } from "@convex-dev/auth/methods/google/server";

/** The frontend origin the emailed links point at. */
const SITE_URL = (env.SITE_URL ?? "http://localhost:5173").replace(/\/+$/, "");

const extraOrigins = (env.AUTH_EXTRA_ORIGINS ?? "")
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

// References built by name instead of through `internal`: `internal`'s type
// includes this module's exports, so using it here makes the exports' types
// circular (TS7022).
function internalMutationRef<Args extends Record<string, unknown>, Ret>(name: string) {
  return makeFunctionReference<"mutation", Args, Ret>(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Args,
    Ret
  >;
}
type Method<Name extends string, Profile> = { method: { name: Name; profile: Profile } };
const refs = {
  createUserEmailPassword: internalMutationRef<Method<"emailPassword", Record<string, never>>, Id<"users">>(
    "users:createUserEmailPassword",
  ),
  createUserGoogle: internalMutationRef<Method<"google", GoogleProfile>, Id<"users">>("users:createUserGoogle"),
  onSignInGoogle: internalMutationRef<Method<"google", GoogleProfile> & { userId: Id<"users"> }, null>(
    "users:onSignInGoogle",
  ),
  // Same signature as @convex-dev/resend's lib.sendEmail (see mail.ts).
  sendEmail: makeFunctionReference<"mutation">("mail:sendEmail") as never,
};

// Placeholder: mail goes through the webhook in mail.ts, never Resend, so no real key exists.
const UNUSED_RESEND_KEY = "unused-webhook-sender";

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithEmailPassword,
  completeSignUpWithEmailPassword,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
  startChangeEmail,
  completeChangeEmail,
} = setupEmailPassword(auth, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  // v2 only knows a Resend sender. `mail.sendEmail` has the same signature as
  // Resend's `lib.sendEmail`, and forwards to the Apps Script webhook instead.
  emailSender: {
    kind: "resend",
    sendEmail: refs.sendEmail,
    apiKey: UNUSED_RESEND_KEY,
    from: "Setstamp",
  },
  urls: {
    signUp: `${SITE_URL}/auth/validate-email`,
    changeEmail: `${SITE_URL}/auth/confirm-email-change`,
    recovery: `${SITE_URL}/auth/reset-password`,
  },
}).attachUserCallbacks({
  createUser: refs.createUserEmailPassword,
});

export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  // Bare origins only: SITE_URL may carry a path (e.g. https://user.github.io/setstamp).
  allowedRedirectOrigins: [...new Set([SITE_URL, ...extraOrigins].map((u) => new URL(u).origin))],
}).attachUserCallbacks({
  createUser: refs.createUserGoogle,
  onSignIn: refs.onSignInGoogle,
});
