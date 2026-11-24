// Signed-out screen: email + password sign in / create account, optional Google and password reset.
// Compact on purpose: it is the first thing the installed app shows when signed out (iOS home-screen
// apps keep their own storage, so lifters sign in once there), and where the landing CTAs lead.
import { useSignInWithEmailPassword, useSignUpWithEmailPassword, useStartPasswordRecovery } from "@convex-dev/auth/methods/email-password/react";
import { useOauth, useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import { useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import { Button, IconChevronLeft, Segmented, TextField, Wordmark } from "../../ui";
import { authErrorMessage } from "./errors";
import "./auth.css";

type Mode = "signIn" | "signUp" | "reset";

export function Welcome({
  initialMode = "signIn",
  onBack,
  appNote,
}: {
  initialMode?: "signIn" | "signUp";
  /** Browser only: back to the landing page. Omitted inside the installed app. */
  onBack?: () => void;
  /** Extra line under the form (e.g. why the installed app asks to sign in again). */
  appNote?: string;
} = {}) {
  const config = useQuery(api.account.authConfig, {});
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ email: string; kind: "signUp" | "reset" } | null>(null);

  const { signIn, pending: signingIn } = useSignInWithEmailPassword(api.auth);
  const { signUp, pending: signingUp } = useSignUpWithEmailPassword(api.auth);
  const { startPasswordRecovery, pending: resetting } = useStartPasswordRecovery(api.auth);
  const { signIn: google } = useSignInWithGoogle(api.auth);
  const { flowError } = useOauth();
  const [googlePending, setGooglePending] = useState(false);

  const pending = signingIn || signingUp || resetting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const addr = email.trim();
    if (mode === "signIn") {
      const r = await signIn({ email: addr, password });
      if (r.status === "error") setError(authErrorMessage(r.userError));
    } else if (mode === "signUp") {
      const r = await signUp({ email: addr, password });
      if (r.success) setSentTo({ email: addr, kind: "signUp" });
      else setError(authErrorMessage(r.userError));
    } else {
      const r = await startPasswordRecovery({ email: addr });
      if (r.success) setSentTo({ email: addr, kind: "reset" });
      else setError(authErrorMessage(r.userError));
    }
  }

  async function onGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      const r = await google();
      if (r.status === "error") setError(authErrorMessage(r.userError as { error: string; cause?: unknown }));
    } finally {
      setGooglePending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="auth">
        <div className="auth__card stack">
          <h1 className="auth__title display">Check your email</h1>
          <p>
            {sentTo.kind === "signUp"
              ? <>We sent a confirmation link to <strong>{sentTo.email}</strong>. Open it in this browser to finish creating your account.</>
              : <>If an account uses <strong>{sentTo.email}</strong>, we sent it a link to reset the password. Open it in this browser.</>}
          </p>
          <p className="muted small">Nothing there after a few minutes? Check spam, or go back and try again.</p>
          <Button variant="secondary" block onClick={() => { setSentTo(null); setMode("signIn"); }}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  const submitLabel = mode === "signIn" ? "Sign in" : mode === "signUp" ? "Create account" : "Send reset link";

  return (
    <div className="auth">
      {onBack && (
        <div className="auth__top">
          <Button variant="ghost" icon={<IconChevronLeft />} onClick={onBack}>
            About Setstamp
          </Button>
        </div>
      )}
      <div className="auth__card stack">
        <header className="auth__head">
          <h1 className="auth__wordmark"><Wordmark height={56} /></h1>
          <p className="auth__lede">A free lifting log that works offline and keeps your full history.</p>
        </header>

        {mode !== "reset" && (
          <Segmented<Mode>
            label="Account"
            value={mode}
            onChange={(m) => { setMode(m); setError(null); }}
            options={[
              { value: "signIn", label: "Sign in" },
              { value: "signUp", label: "Create account" },
            ]}
          />
        )}
        {mode === "reset" && <h2 className="auth__subtitle">Reset your password</h2>}

        <form className="stack" onSubmit={onSubmit}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
          {mode !== "reset" && (
            <TextField
              label="Password"
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              required
              minLength={mode === "signUp" ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              hint={mode === "signUp" ? "At least 8 characters. We'll email you a link to confirm." : undefined}
            />
          )}
          {error && <p className="auth__error" role="alert">{error}</p>}
          {flowError && !error && <p className="auth__error" role="alert">Google sign-in didn't finish. Try again.</p>}
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {submitLabel}
          </Button>
        </form>

        {mode === "signIn" && config?.passwordReset && (
          <button type="button" className="auth__link" onClick={() => { setMode("reset"); setError(null); }}>
            Forgot your password?
          </button>
        )}
        {mode === "reset" && (
          <button type="button" className="auth__link" onClick={() => { setMode("signIn"); setError(null); }}>
            Back to sign in
          </button>
        )}

        {mode !== "reset" && config?.google && (
          <>
            <div className="auth__or" aria-hidden="true"><span>or</span></div>
            <Button variant="secondary" size="lg" block loading={googlePending} onClick={onGoogle}>
              Continue with Google
            </Button>
          </>
        )}

        {appNote && <p className="auth__note">{appNote}</p>}
      </div>
    </div>
  );
}
