/// <reference types="vite/client" />
// Shared convex-test harness: app modules + the Convex Auth v2 components.
import { convexTest } from "convex-test";
import authCore from "@convex-dev/auth/test";
import { registerEmail } from "@convex-dev/auth/components/email/test";
import { registerPassword } from "@convex-dev/auth/components/password/test";
import { registerGoogleOauth } from "@convex-dev/auth/components/google/test";
import schema from "./schema";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const modules = import.meta.glob(["./**/*.*s", "!./**/*.test.ts", "!./**/*.d.ts"]);

export function setup() {
  const t = convexTest(schema, modules);
  authCore.registerCore(t);
  registerEmail(t);
  registerPassword(t);
  registerGoogleOauth(t);
  return t;
}

export type T = ReturnType<typeof setup>;

/** Create a users row and a real Convex Auth session for it. */
export async function signInAs(t: T, name: string) {
  const userId: Id<"users"> = await t.run((ctx) => ctx.db.insert("users", { createdBy: "emailPassword", name }));
  const tokens = await t.run((ctx) =>
    ctx.runMutation(components.auth.public._internal_dangerous_signIn, {
      claims: { method: "emailPassword", profile: {} },
      componentPath: "authPassword",
      userId,
      accessTokenTtlSeconds: 3600,
      refreshInactivityTimeoutSeconds: 86_400,
      sessionMaxLifetimeSeconds: 86_400,
    }),
  );
  return { userId, as: t.withIdentity(authCore.sessionIdentity(tokens)) };
}
