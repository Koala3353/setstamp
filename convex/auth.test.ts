import { afterEach, describe, expect, test, vi } from "vitest";
import authCore from "@convex-dev/auth/test";
import { api } from "./_generated/api";
import { setup, type T } from "./test.setup";

const IP = { ip: "203.0.113.7" };
const PASSWORD = "correct horse battery staple";

async function lastMail(t: ReturnType<T["withRequestMetadata"]>) {
  const rows = await t.run((ctx) => ctx.db.query("mailOutbox").order("desc").take(1));
  return rows[0];
}
const codeFrom = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("code")!;

afterEach(() => vi.unstubAllEnvs());

describe("auth (email + password through the webhook mailer)", () => {
  test("sign-up, validation link, sign-in, recovery", async () => {
    vi.stubEnv("MAIL_WEBHOOK_URL", "https://example.invalid/exec");
    vi.stubEnv("MAIL_WEBHOOK_SECRET", "s3cret");
    const t = setup().withRequestMetadata(IP);

    const up = await t.mutation(api.auth.signUpWithEmailPassword, { email: "a@example.com", password: PASSWORD });
    if (!up.success) throw new Error(JSON.stringify(up));
    const validation = await lastMail(t);
    expect(validation.to).toBe("a@example.com");
    expect(validation.html).toContain("<a href=");

    const done = await t.mutation(api.auth.completeSignUpWithEmailPassword, {
      emailCode: codeFrom(validation.text),
      browserSecret: up.browserSecret,
    });
    expect(done.status).toBe("complete");

    const signIn = await t.mutation(api.auth.signInWithEmailPassword, { email: "a@example.com", password: PASSWORD });
    if (signIn.status !== "complete") throw new Error(JSON.stringify(signIn));
    const me = await t.withIdentity(authCore.sessionIdentity(signIn.tokens)).query(api.account.me, {});
    expect(me).toMatchObject({ email: "a@example.com", signInMethod: "emailPassword" });

    const rec = await t.mutation(api.auth.startPasswordRecovery, { email: "a@example.com" });
    expect(rec.success).toBe(true);
    expect((await lastMail(t)).subject).toMatch(/password/i);
  });

  test("with no webhook configured, recovery fails clearly and sign-in still works", async () => {
    vi.stubEnv("MAIL_WEBHOOK_URL", "https://example.invalid/exec");
    vi.stubEnv("MAIL_WEBHOOK_SECRET", "s3cret");
    const t = setup().withRequestMetadata(IP);
    const up = await t.mutation(api.auth.signUpWithEmailPassword, { email: "b@example.com", password: PASSWORD });
    if (!up.success) throw new Error("sign-up failed");
    await t.mutation(api.auth.completeSignUpWithEmailPassword, {
      emailCode: codeFrom((await lastMail(t)).text),
      browserSecret: up.browserSecret,
    });

    vi.stubEnv("MAIL_WEBHOOK_URL", undefined);
    vi.stubEnv("MAIL_WEBHOOK_SECRET", undefined);
    vi.stubEnv("MAIL_DEV_LOG", undefined);
    expect(await t.query(api.account.authConfig, {})).toMatchObject({ passwordReset: false });
    await expect(t.mutation(api.auth.startPasswordRecovery, { email: "b@example.com" })).rejects.toThrow(
      /not configured|EMAIL_NOT_CONFIGURED/,
    );
    const signIn = await t.mutation(api.auth.signInWithEmailPassword, { email: "b@example.com", password: PASSWORD });
    expect(signIn.status).toBe("complete");
  });

  test("authConfig reports Google disabled while its env is the placeholder", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "unset");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "unset");
    const t = setup();
    expect((await t.query(api.account.authConfig, {})).google).toBe(false);
  });
});
