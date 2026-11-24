// What to render at boot, before the hash router takes over. Pure so it can be tested.
//
//   signed in                      -> the app (never the landing)
//   signed out, installed app      -> compact sign-in (never the marketing page)
//   signed out, browser, "/"       -> landing page
//   signed out, browser, #/signin  -> sign-in form; #/signup -> create-account form
//   signed out, browser, deep link -> sign-in form (they were heading into the app)
// Email links (/auth/...) are handled before this, on real paths.

export type SessionPhase = "loading" | "signedOut" | "ready";

export type EntryView =
  | { view: "loading" }
  | { view: "landing" }
  | { view: "welcome"; mode: "signIn" | "signUp"; standalone: boolean }
  | { view: "app"; redirectTo?: string };

export const AUTH_PATHS = { signIn: "/signin", signUp: "/signup" } as const;

export function decideEntry(input: { phase: SessionPhase; standalone: boolean; hashPath: string }): EntryView {
  const path = normalise(input.hashPath);
  if (input.phase === "ready") {
    // Signed in on the sign-in URL (e.g. just finished signing in): land on Today.
    return path === AUTH_PATHS.signIn || path === AUTH_PATHS.signUp ? { view: "app", redirectTo: "/" } : { view: "app" };
  }
  if (input.phase === "loading") return { view: "loading" };
  if (path === AUTH_PATHS.signUp) return { view: "welcome", mode: "signUp", standalone: input.standalone };
  if (input.standalone) return { view: "welcome", mode: "signIn", standalone: true };
  if (path === "/") return { view: "landing" };
  return { view: "welcome", mode: "signIn", standalone: false };
}

/** Launched from the home-screen icon: display-mode, or the manifest's start_url marker. */
export function launchedAsApp(input: { displayStandalone: boolean; search: string }): boolean {
  if (input.displayStandalone) return true;
  return new URLSearchParams(input.search).get("source") === "pwa";
}

function normalise(p: string): string {
  const path = (p.split("?")[0] ?? "/").replace(/\/+$/, "");
  return path === "" ? "/" : path.startsWith("/") ? path : "/" + path;
}
