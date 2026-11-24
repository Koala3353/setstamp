// Landing pages for links in emails: <base>/auth/validate-email, /auth/reset-password,
// /auth/confirm-email-change, each with ?code=. These are real paths (not hash routes) because the
// backend builds the URLs; once done we replace the URL with the app root.
import { useCompleteChangeEmail, useCompletePasswordRecovery, useCompleteSignUpWithEmailPassword } from "@convex-dev/auth/methods/email-password/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, Spinner, TextField } from "../../ui";
import { authErrorMessage } from "./errors";
import "./auth.css";

export type EmailLinkKind = "validate" | "reset" | "changeEmail";

export function emailLinkFromLocation(): { kind: EmailLinkKind; code: string } | null {
  if (typeof window === "undefined") return null;
  // Strip the deploy base (e.g. "/setstamp/" on GitHub Pages) so the paths match either way.
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  let path = window.location.pathname.replace(/\/+$/, "");
  if (base && path.startsWith(base + "/")) path = path.slice(base.length);
  const code = new URLSearchParams(window.location.search).get("code") ?? "";
  const kind: EmailLinkKind | null =
    path === "/auth/validate-email" ? "validate" : path === "/auth/reset-password" ? "reset" : path === "/auth/confirm-email-change" ? "changeEmail" : null;
  return kind ? { kind, code } : null;
}

/** Leave the link page: back to the app root (drops the code from the URL and history). */
export function leaveEmailLink() {
  window.location.replace(import.meta.env.BASE_URL + "#/");
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__card stack">
        <h1 className="auth__title display">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Working({ title, label }: { title: string; label: string }) {
  return (
    <Frame title={title}>
      <p className="auth__working"><Spinner size={20} label="" /> {label}</p>
    </Frame>
  );
}

function Done({ title, message }: { title: string; message: string }) {
  return (
    <Frame title={title}>
      <p>{message}</p>
      <Button variant="primary" size="lg" block onClick={leaveEmailLink}>Open the app</Button>
    </Frame>
  );
}

function Failed({ title, message }: { title: string; message: string }) {
  return (
    <Frame title={title}>
      <p className="auth__error" role="alert">{message}</p>
      <Button variant="secondary" size="lg" block onClick={leaveEmailLink}>Back to the app</Button>
    </Frame>
  );
}

function ValidateEmail({ code }: { code: string }) {
  const state = useCompleteSignUpWithEmailPassword(api.auth, { emailCode: code });
  if (state.status === "loading") return <Working title="Confirming your email" label="Checking the link…" />;
  if (state.status === "error") return <Failed title="Couldn't confirm your email" message={authErrorMessage(state.userError)} />;
  return <Done title="Email confirmed" message="Your account is ready and you're signed in." />;
}

function ResetPassword({ code }: { code: string }) {
  const state = useCompletePasswordRecovery(api.auth, { emailCode: code });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (state.status === "loading") return <Working title="Reset your password" label="Checking the link…" />;
  if (state.status === "error") return <Failed title="Couldn't reset your password" message={authErrorMessage(state.userError)} />;
  if (state.status === "complete") return <Done title="Password changed" message="Your new password is set and you're signed in." />;
  const { completePasswordRecovery, pending } = state;
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await completePasswordRecovery({ newPassword: password });
    if (r.status === "error") setError(authErrorMessage(r.userError as { error: string; cause?: unknown }));
  }
  return (
    <Frame title="Choose a new password">
      <form className="stack" onSubmit={onSubmit}>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          hint="At least 8 characters."
        />
        {error && <p className="auth__error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" size="lg" block loading={pending}>Set new password</Button>
      </form>
    </Frame>
  );
}

function ConfirmEmailChange({ code }: { code: string }) {
  const state = useCompleteChangeEmail(api.auth, { emailCode: code });
  if (state.status === "loading") return <Working title="Confirming your new email" label="Checking the link…" />;
  if (state.status === "error") return <Failed title="Couldn't change your email" message={authErrorMessage(state.userError)} />;
  return <Done title="Email changed" message="Your account now uses the new address." />;
}

export function EmailLinkScreen({ kind, code }: { kind: EmailLinkKind; code: string }) {
  if (!code) return <Failed title="This link is incomplete" message="The link is missing its code. Open it straight from the email, or ask for a new one." />;
  if (kind === "validate") return <ValidateEmail code={code} />;
  if (kind === "reset") return <ResetPassword code={code} />;
  return <ConfirmEmailChange code={code} />;
}
