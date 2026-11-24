// Runs the first-run tour: decides whether it starts, feeds the state machine with what the app is
// doing (route, open workout, logged sets, taps on the body map and stars) and saves progress per
// user in localStorage so a reload resumes the same step. Also owns the help sheet.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { navigate, useRoute } from "../../app/router";
import { useRows, useSyncStatus, useSyncStore } from "../../sync/react";
import { useToast } from "../../ui";
import { rest } from "../workout/restTimer";
import { HelpSheet } from "./HelpSheet";
import { discardWorkout } from "./practice";
import { freshTour, parseStored, reduce, startupDecision, type AppSignal, type Snapshot, type TourEvent, type TourState } from "./machine";
import { TourOverlay } from "./TourOverlay";

/** Without a first sync we can't tell a new account from a new device; stop waiting after this. */
const DECIDE_TIMEOUT_MS = 8000;

const storageKey = (userKey: string) => `gym.tutorial.${userKey}`;

function readStored(userKey: string): TourState | null {
  try {
    return parseStored(localStorage.getItem(storageKey(userKey)));
  } catch {
    return null;
  }
}

function writeStored(userKey: string, s: TourState) {
  try {
    localStorage.setItem(storageKey(userKey), JSON.stringify(s));
  } catch {
    // Storage blocked: the tour can't resume after a reload. It still runs now.
  }
}

type TutorialCtx = {
  /** The tour is on screen. */
  running: boolean;
  /** Hold other first-run popups (install) until the tour has started and ended, or won't start. */
  holdPopups: boolean;
  replay: () => void;
  openHelp: () => void;
};

const NOOP: TutorialCtx = {
  running: false,
  holdPopups: false,
  replay: () => {},
  openHelp: () => {},
};
const Ctx = createContext<TutorialCtx>(NOOP);

export function useTutorial(): TutorialCtx {
  return useContext(Ctx);
}

function useSnapshot(): Snapshot {
  const route = useRoute();
  const sessions = useRows("sessions");
  const exercises = useRows("sessionExercises");
  const sets = useRows("sets");
  let open: { cid: string; startedAt: number } | null = null;
  for (const r of sessions) {
    if (r.deleted || !r.data || r.data.endedAt !== null) continue;
    if (!open || r.data.startedAt > open.startedAt) open = { cid: r.cid, startedAt: r.data.startedAt };
  }
  const openCid = open?.cid ?? null;
  const exerciseCount = openCid ? exercises.filter((r) => !r.deleted && r.data?.sessionCid === openCid).length : 0;
  const doneSetCount = openCid ? sets.filter((r) => !r.deleted && r.data?.sessionCid === openCid && r.data.done).length : 0;
  return useMemo(
    () => ({
      route: route.name,
      openSessionCid: openCid,
      exerciseCount,
      doneSetCount,
    }),
    [route.name, openCid, exerciseCount, doneSetCount],
  );
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const store = useSyncStore();
  const userKey = store?.userKey ?? null;
  const status = useSyncStatus();
  const toast = useToast();
  const snap = useSnapshot();
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const [tour, setTour] = useState<TourState | null>(null);
  const [decided, setDecided] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // ---- Start-up decision: resume, start fresh, or stay out of the way. ----
  useEffect(() => {
    if (decided || !store || !userKey) return;
    const stored = readStored(userKey);
    const hasSynced = status.lastSyncAt !== null;
    // A brand-new account is only knowable after the first pull; a stored record answers sooner.
    if (!stored && !hasSynced) {
      const t = window.setTimeout(() => setDecided(true), DECIDE_TIMEOUT_MS);
      return () => window.clearTimeout(t);
    }
    const isNewUser = store.list("sessions").length === 0;
    const decision = startupDecision(stored, isNewUser);
    if (decision === "resume" && stored) setTour(reduce(stored, { type: "snapshot", snap: snapRef.current }));
    else if (decision === "start") {
      setTour(freshTour());
      if (snapRef.current.route !== "today") navigate("/", { replace: true });
    }
    setDecided(true);
  }, [decided, store, userKey, status.lastSyncAt]);

  const running = tour?.status === "active";

  // ---- Persist every change; drop the overlay when the tour ends. ----
  useEffect(() => {
    if (!tour || !userKey) return;
    writeStored(userKey, tour);
  }, [tour, userKey]);

  const dispatch = useCallback((e: TourEvent) => {
    setTour((cur) => (cur ? reduce(cur, e, snapRef.current) : cur));
  }, []);

  // App state drives step completion.
  useEffect(() => {
    if (running) dispatch({ type: "snapshot", snap });
  }, [running, snap, dispatch]);

  // Taps the tour waits for, caught without touching the feature components.
  useEffect(() => {
    if (!running) return;
    const onClick = (ev: MouseEvent) => {
      const el = ev.target instanceof Element ? ev.target : null;
      if (!el) return;
      let signal: AppSignal | null = null;
      if (el.closest(".bm-root [role='button'], .bm-root .bm-hit, .bm-row, .bm-chip")) signal = "muscle";
      else if (el.closest(".exrow__star")) signal = "favorite";
      if (signal) dispatch({ type: "app", name: signal });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [running, dispatch]);

  const finishTour = useCallback(() => {
    setTour((cur) => (cur ? { ...cur, status: "done" } : cur));
  }, []);

  const skip = useCallback(() => {
    dispatch({ type: "skip" });
    toast.show({
      message: "Tour closed. Replay it from Settings, under Help.",
    });
  }, [dispatch, toast]);

  const discardPractice = useCallback(async () => {
    const cid = tour?.practiceCid;
    if (!store || !cid) return;
    await discardWorkout(store, cid);
    rest.skip();
    navigate("/", { replace: true });
    dispatch({ type: "discarded" });
    toast.show({ message: "Practice workout discarded" });
  }, [store, tour?.practiceCid, dispatch, toast]);

  const keepPractice = useCallback(() => {
    // The tab bar is hidden inside a workout; Today shows it again for the next step.
    if (snapRef.current.route === "workout") navigate("/");
    dispatch({ type: "next" });
  }, [dispatch]);

  const replay = useCallback(() => {
    setHelpOpen(false);
    setDecided(true);
    navigate("/");
    setTour(freshTour());
  }, []);

  const value = useMemo<TutorialCtx>(
    () => ({
      running,
      holdPopups: running || !decided,
      replay,
      openHelp: () => setHelpOpen(true),
    }),
    [running, decided, replay],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {running && tour && (
        <TourOverlay
          tour={tour}
          snap={snap}
          onNext={() => (tour.step === "done" ? finishTour() : tour.step === "wrap" ? keepPractice() : dispatch({ type: "next" }))}
          onSkip={skip}
          onDiscardPractice={discardPractice}
        />
      )}
      <HelpSheet open={helpOpen} route={snap.route} onClose={() => setHelpOpen(false)} onReplay={replay} />
    </Ctx.Provider>
  );
}
