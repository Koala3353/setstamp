import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import {
  confirmEmailChange,
  detectEmail,
  emailChanged,
  escapeHtml,
  genericEmail,
  htmlToText,
  passwordChanged,
  passwordReset,
  renderEmail,
  verifyEmail,
} from "./emailTemplates";
import { setup } from "./test.setup";

// Bodies exactly as @convex-dev/auth 2.1.0 builds them (challengeEmailText / notify).
const challenge = (intro: string, link: string, ttl: string) =>
  `${intro}\n\n${link}\n\nThe link stops working after ${ttl}, and works only in the browser you started from.\n\n` +
  "If you did not request this email, you can safely ignore it.";
const PLACEHOLDER = "x"; // sendEmail ignores it (webhook sender)
const SIGNUP_LINK = "https://gym.example/auth/validate-email?code=Ab_c-12%2B3&x=1";
const CHANGE_LINK = "https://gym.example/auth/confirm-email-change?code=zz9";
const RESET_LINK = "https://gym.example/auth/reset-password?code=r3s3t";

const AUTH_MAILS = {
  signUp: { subject: "Validate your email address", text: challenge("Open this link to validate your email address:", SIGNUP_LINK, "1 hour") },
  changeEmail: { subject: "Validate your email address", text: challenge("Open this link to validate your email address:", CHANGE_LINK, "1 hour") },
  reset: { subject: "Reset your password", text: challenge("Open this link to reset your password:", RESET_LINK, "10 minutes") },
  passwordChanged: {
    subject: "Your password was changed",
    text: "The password of your account was changed.\n\nIf you did this, you can ignore this email. If you did not do this, change your password immediately or contact support.",
  },
  emailChanged: {
    subject: "Your email address was changed",
    text: "The email address of your account was changed to new@example.com.\n\nIf you did this, you can ignore this email. If you did not do this, reset your password immediately or contact support.",
  },
};

function expectBranded(mail: { subject: string; text: string; html: string }) {
  expect(mail.subject.length).toBeGreaterThan(0);
  expect(mail.text.length).toBeGreaterThan(0);
  expect(mail.html).toMatch(/^<!doctype html>/);
  expect(mail.html).toContain('content="light only"');
  expect(mail.html).toContain("max-width:560px");
  expect(mail.html).toContain("#ebe9e6");
  expect(mail.html).toContain("#fcfbfa");
  expect(mail.html).toContain("Big Shoulders Stencil");
  expect(mail.html).not.toMatch(/undefined|\[object Object\]/);
  expect(mail.html.length).toBeLessThan(50_000); // Apps Script relay cap
}

describe("detectEmail", () => {
  test("recognises every Convex Auth email", () => {
    expect(detectEmail(AUTH_MAILS.signUp)).toEqual({ kind: "verifyEmail", link: SIGNUP_LINK, ttl: "1 hour" });
    expect(detectEmail(AUTH_MAILS.changeEmail)).toEqual({ kind: "confirmEmailChange", link: CHANGE_LINK, ttl: "1 hour" });
    expect(detectEmail(AUTH_MAILS.reset)).toEqual({ kind: "passwordReset", link: RESET_LINK, ttl: "10 minutes" });
    expect(detectEmail(AUTH_MAILS.passwordChanged)).toEqual({ kind: "passwordChanged" });
    expect(detectEmail(AUTH_MAILS.emailChanged)).toEqual({ kind: "emailChanged", newEmail: "new@example.com" });
  });

  test("anything else is generic", () => {
    expect(detectEmail({ subject: "Hello", text: "Hi" }).kind).toBe("generic");
    // A link email with no link is not trusted as that type.
    expect(detectEmail({ subject: "Reset your password", text: "no link" }).kind).toBe("generic");
    expect(detectEmail({ subject: "Reset your password", text: "javascript:alert(1)" }).kind).toBe("generic");
  });
});

describe("templates", () => {
  test("every type renders branded html + plain text", () => {
    for (const mail of [
      verifyEmail({ link: SIGNUP_LINK }),
      confirmEmailChange({ link: CHANGE_LINK }),
      passwordReset({ link: RESET_LINK }),
      passwordChanged({ siteUrl: "https://gym.example" }),
      passwordChanged(),
      emailChanged({ newEmail: "n@example.com" }),
      genericEmail({ subject: "Note", text: "Plain body" }),
    ]) {
      expectBranded(mail);
    }
  });

  test("links are preserved exactly (text) and attribute-escaped (html)", () => {
    for (const [mail, link] of [
      [renderEmail(AUTH_MAILS.signUp), SIGNUP_LINK],
      [renderEmail(AUTH_MAILS.changeEmail), CHANGE_LINK],
      [renderEmail(AUTH_MAILS.reset), RESET_LINK],
    ] as const) {
      expectBranded(mail);
      // First URL in the text is the action link (auth.test.ts relies on this).
      expect(mail.text.match(/https?:\/\/\S+/)![0]).toBe(link);
      expect(mail.html).toContain(`href="${escapeHtml(link)}"`);
      expect(new URL(link).searchParams.get("code")).toBeTruthy();
    }
    expect(renderEmail(AUTH_MAILS.reset).text).toContain("10 minutes");
    expect(renderEmail(AUTH_MAILS.reset).subject).toMatch(/password/i);
  });

  test("interpolated text is escaped", () => {
    const evil = `<script>alert("x")</script>&'`;
    const m = emailChanged({ newEmail: `${evil}@x.com` });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;");
    const g = genericEmail({ subject: evil, text: `${evil}\n\nhttps://ok.example/a?b=1&c=<2>` });
    expect(g.html).not.toContain("<script>");
    expect(g.html).not.toMatch(/href="[^"]*</);
  });

  test("non-http links never become buttons", () => {
    const m = verifyEmail({ link: "javascript:alert(1)" });
    expect(m.html).not.toContain("javascript:");
  });

  test("generic: a lone link becomes the button, several links stay inline", () => {
    const one = genericEmail({ subject: "Hi", text: "Open this:\n\nhttps://a.example/x?y=1" });
    expect(one.html).toContain("Open link");
    expect(one.html).toContain('href="https://a.example/x?y=1"');
    expect(one.text).toContain("https://a.example/x?y=1");
    const two = genericEmail({ subject: "Hi", text: "See https://a.example and https://b.example." });
    expect(two.html).not.toContain("Open link");
    expect(two.html).toContain('href="https://a.example"');
    expect(two.html).toContain('href="https://b.example"');
  });

  test("htmlToText keeps links", () => {
    expect(htmlToText('<p>Go <a href="https://a.example/x">here</a></p>')).toBe("Go here https://a.example/x");
  });
});

describe("mail.sendEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("replaces library html with the branded template", async () => {
    vi.stubEnv("MAIL_WEBHOOK_URL", "https://example.invalid/exec");
    vi.stubEnv("MAIL_WEBHOOK_SECRET", "s3cret");
    const t = setup();
    await t.mutation(internal.mail.sendEmail, {
      options: { apiKey: PLACEHOLDER, testMode: false, initialBackoffMs: 1, retryAttempts: 1 },
      from: "Setstamp",
      to: ["a@example.com"],
      ...AUTH_MAILS.reset,
      html: "<p>library html</p>",
    });
    const rows = await t.run((ctx) => ctx.db.query("mailOutbox").take(5));
    expect(rows).toHaveLength(1);
    expect(rows[0].html).not.toContain("library html");
    expect(rows[0].html).toContain("Choose a new password");
    expect(rows[0].html).toContain(`href="${escapeHtml(RESET_LINK)}"`);
    expect(rows[0].text).toContain(RESET_LINK);
  });
});
