// Plain, honest copy for auth failures. Codes come from Convex Auth's typed `userError`s, or from
// a ConvexError thrown by our mail sender (surfaced by the hooks as OTHER_ERROR with a `cause`).
import { ConvexError } from "convex/values";

type UserError = { error: string; cause?: unknown; retryAfterMs?: number };

const COPY: Record<string, string> = {
  INVALID_CREDENTIALS: "That email and password don't match.",
  USER_NOT_FOUND: "That email and password don't match.",
  EMAIL_NOT_FOUND: "No account uses that email.",
  EMAIL_TAKEN: "An account already uses that email. Sign in instead, or reset your password.",
  INVALID_EMAIL: "That doesn't look like an email address.",
  PASSWORD_TOO_SHORT: "Use a longer password (at least 8 characters).",
  PASSWORD_TOO_LONG: "That password is too long.",
  PASSWORD_TOO_COMMON: "That password is too common. Pick something less guessable.",
  PASSWORD_HAS_SURROUNDING_WHITESPACE: "Remove the spaces at the start or end of your password.",
  INVALID_CHALLENGE: "This link has expired or was already used. Ask for a new one.",
  INCORRECT_CODE: "This link isn't valid. Ask for a new one.",
  INVALID_CODE: "This link isn't valid. Ask for a new one.",
  CHALLENGE_EXPIRED: "This link has expired. Ask for a new one.",
  MISSING_SECRET: "Open this link in the same browser where you started. Links only work there.",
  WRONG_USER: "This link belongs to a different account than the one signed in here.",
  NOT_LOGGED_IN: "Sign in first, then open the link again.",
  EMAIL_NOT_CONFIGURED: "Email isn't set up yet on this server, so we can't send the link. Try again later.",
};

function causeCode(cause: unknown): string | null {
  if (cause instanceof ConvexError) {
    const d = cause.data as unknown;
    if (d && typeof d === "object" && "code" in d && typeof (d as { code: unknown }).code === "string") return (d as { code: string }).code;
    if (typeof d === "string" && d.includes("EMAIL_NOT_CONFIGURED")) return "EMAIL_NOT_CONFIGURED";
  }
  const msg = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (msg.includes("EMAIL_NOT_CONFIGURED")) return "EMAIL_NOT_CONFIGURED";
  return null;
}

export function authErrorMessage(e: UserError): string {
  if (e.error === "RATE_LIMITED") {
    const s = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : null;
    return s ? `Too many attempts. Try again in ${s} seconds.` : "Too many attempts. Wait a moment and try again.";
  }
  if (e.error === "OTHER_ERROR") {
    const code = causeCode(e.cause);
    if (code && COPY[code]) return COPY[code];
    if (typeof navigator !== "undefined" && !navigator.onLine) return "You're offline. Connect to sign in.";
    return "Something went wrong on our side. Try again.";
  }
  return COPY[e.error] ?? "Something went wrong. Try again.";
}
