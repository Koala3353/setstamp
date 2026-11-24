// Per-user SyncStore lifecycle.
//
// - Signed in: open the store keyed by the Convex user id (api.account.me), start it, and kick it
//   whenever auth (re)connects or the device comes back online.
// - Offline app start: if someone was signed in on this device before and auth can't be confirmed
//   (offline, or still loading), open that user's local store so logging works; sync resumes once
//   auth refreshes. The last user key lives in localStorage.
// - Sign out: close the store, optionally wipe the user's local database, then revoke the session.
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { SyncStore, createConvexTransport, wipeLocalUser } from "../../sync";
import { SyncProvider, useCatalog, useSyncStatus } from "../../sync/react";

const LAST_USER_KEY = "gym.lastUserKey";

function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}
function writeLastUser(key: string | null) {
  try {
    if (key) localStorage.setItem(LAST_USER_KEY, key);
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* storage blocked: offline start just won't have a fallback */
  }
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type SessionPhase =
  /** Deciding whether anyone is signed in. */
  | "loading"
  /** Nobody signed in: show the welcome screen. */
  | "signedOut"
  /** Store open; `authenticated` says whether it can sync right now. */
  | "ready";

type SessionCtx = {
  phase: SessionPhase;
  store: SyncStore | null;
  userKey: string | null;
  /** True when the server confirmed the session; false while running from local data only. */
  authenticated: boolean;
  email: string | null;
  /** Close the store, optionally wipe local data, and revoke the session. */
  signOut: (opts: { wipe: boolean }) => Promise<void>;
};

const Ctx = createContext<SessionCtx | null>(null);

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession must be used inside <SessionProvider>");
  return c;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useConvex();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut: authSignOut } = useAuthActions();
  const online = useOnline();
  const me = useQuery(api.account.me, isAuthenticated ? {} : "skip");
  const [lastUser, setLastUser] = useState<string | null>(readLastUser);
  const [signingOut, setSigningOut] = useState(false);

  // Which user's local data to open, if any.
  const serverKey = isAuthenticated && me ? (me.userId as string) : null;
  const fallbackKey = !isAuthenticated && lastUser && (isLoading || !online) ? lastUser : null;
  const userKey = signingOut ? null : (serverKey ?? fallbackKey);

  // Hold the signing-out state until auth actually reports signed out, so nothing reopens meanwhile.
  useEffect(() => {
    if (signingOut && !isAuthenticated && !isLoading) setSigningOut(false);
  }, [signingOut, isAuthenticated, isLoading]);

  useEffect(() => {
    if (signingOut) return;
    if (serverKey && serverKey !== lastUser) {
      writeLastUser(serverKey);
      setLastUser(serverKey);
    }
  }, [serverKey, lastUser, signingOut]);

  // The store reads auth state through refs so it never needs re-opening when auth flips.
  const authRef = useRef(isAuthenticated);
  authRef.current = isAuthenticated;

  const [store, setStore] = useState<SyncStore | null>(null);
  useEffect(() => {
    if (!userKey) {
      setStore(null);
      return;
    }
    let cancelled = false;
    let opened: SyncStore | null = null;
    void SyncStore.open({
      userKey,
      transport: createConvexTransport(client),
      isOnline: () => navigator.onLine,
      isAuthenticated: () => authRef.current,
    }).then(
      (s) => {
        if (cancelled) {
          s.close();
          return;
        }
        opened = s;
        s.start();
        setStore(s);
      },
      (e) => console.error("Could not open local data", e),
    );
    return () => {
      cancelled = true;
      opened?.close();
      setStore((cur) => (cur === opened ? null : cur));
    };
  }, [userKey, client]);

  // Auth (re)confirmed or back online: push what's queued and pull, and fetch the catalog if missing.
  useEffect(() => {
    if (!store || !isAuthenticated || !online) return;
    store.kick();
    if (store.getCatalog().length === 0) void store.syncCatalog().catch(() => {});
  }, [store, isAuthenticated, online]);

  const signOut = useCallback(
    async ({ wipe }: { wipe: boolean }) => {
      const key = store?.userKey ?? userKey;
      setSigningOut(true);
      try {
        store?.close();
        if (key && wipe) await wipeLocalUser(key);
        // An explicit sign-out never reopens this user's data offline on next start.
        writeLastUser(null);
        setLastUser(null);
        try {
          await authSignOut();
        } catch (e) {
          // Offline: the server-side revoke can't happen now, but local tokens are cleared.
          console.warn("Sign-out request failed", e);
        }
      } catch (e) {
        setSigningOut(false);
        throw e;
      }
    },
    [store, userKey, authSignOut],
  );

  const phase: SessionPhase = store
    ? "ready"
    : signingOut
      ? "signedOut"
      : userKey || isLoading || (isAuthenticated && me === undefined)
        ? "loading"
        : "signedOut";

  const value = useMemo<SessionCtx>(
    () => ({
      phase,
      store,
      userKey,
      authenticated: isAuthenticated && !!serverKey,
      email: me?.email ?? null,
      signOut,
    }),
    [phase, store, userKey, isAuthenticated, serverKey, me?.email, signOut],
  );

  return (
    <Ctx.Provider value={value}>
      {/* Re-key on user switch so no screen keeps another user's state. */}
      <SyncProvider key={store?.userKey ?? "none"} store={store}>
        {children}
      </SyncProvider>
    </Ctx.Provider>
  );
}

export type CatalogState = {
  /** Catalog rows are available (from cache or freshly fetched). */
  ready: boolean;
  /** First-run fetch in flight: show skeletons. */
  loading: boolean;
  /** Empty and can't fetch right now (offline or an error). */
  error: string | null;
  retry: () => void;
};

/** Catalog readiness for skeletons on first run. Works offline from cache afterwards. */
export function useCatalogReady(): CatalogState {
  const { store } = useSession();
  const catalog = useCatalog();
  const status = useSyncStatus();
  const online = useOnline();
  const ready = catalog.length > 0;
  const retry = useCallback(() => {
    if (store) void store.syncCatalog().catch(() => {});
  }, [store]);
  if (ready) return { ready, loading: false, error: null, retry };
  if (!online)
    return {
      ready,
      loading: false,
      error: "You're offline. The exercise list downloads the first time you're online.",
      retry,
    };
  if (status.lastError && status.state === "error")
    return {
      ready,
      loading: false,
      error: "Couldn't download the exercise list.",
      retry,
    };
  return { ready, loading: true, error: null, retry };
}
