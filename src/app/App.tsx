import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { EmailLinkScreen, emailLinkFromLocation } from "../features/auth/EmailLinks";
import { Welcome } from "../features/auth/Welcome";
import { InstallPrompt } from "../features/install/InstallPrompt";
import { decideEntry, launchedAsApp } from "../features/landing/entry";
import { isIOS, isStandalone } from "../features/settings/install";
import { TutorialProvider, useTutorial } from "../features/tutorial";
import { SessionProvider, useSession } from "../features/session/SessionProvider";
import { SyncIssuesSheet } from "../features/session/SyncIssues";
import { Spinner, ToastProvider } from "../ui";
import { ActiveWorkoutProvider, useActiveWorkout } from "./activeWorkout";
import { navigate, useRoute, type Route } from "./router";
import { Shell } from "./Shell";
import { UpdatePrompt } from "./UpdatePrompt";
import { ExerciseScreen } from "./screens/ExerciseScreen";
import { ExercisesScreen } from "./screens/ExercisesScreen";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { ProgramScreen } from "./screens/ProgramScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { WorkoutScreen } from "./screens/WorkoutScreen";

function screenFor(route: Route, workoutName: string | null): { title: string; node: ReactNode } {
  switch (route.name) {
    case "today":
      return { title: "Today", node: <TodayScreen /> };
    case "program":
      return { title: "Program", node: <ProgramScreen /> };
    case "exercises":
      return { title: "Exercises", node: <ExercisesScreen /> };
    case "exercise":
      return { title: "Exercise", node: <ExerciseScreen exId={route.params.exId ?? ""} /> };
    case "progress":
      return { title: "Progress", node: <ProgressScreen /> };
    case "settings":
      return { title: "Settings", node: <SettingsScreen /> };
    case "workout":
      return { title: workoutName ?? "Workout", node: <WorkoutScreen /> };
    default:
      return { title: "Not found", node: <NotFoundScreen /> };
  }
}

// Marketing page: its own chunk, so the installed app never downloads it.
const Landing = lazy(() => import("../features/landing/Landing"));

// Decided once: the manifest's start_url carries ?source=pwa, and display-mode can't change mid-run.
const AS_APP = typeof window !== "undefined" && launchedAsApp({ displayStandalone: isStandalone(), search: window.location.search });

function Routed() {
  const route = useRoute();
  const { session } = useActiveWorkout();
  const tour = useTutorial();
  const { title, node } = screenFor(route, session?.name ?? null);
  return (
    <Shell title={title}>
      <UpdatePrompt />
      {node}
      {/* The tour goes first on a new account; the install invitation waits until it ends. */}
      <InstallPrompt onToday={route.name === "today"} workoutActive={session != null} held={tour.holdPopups} />
    </Shell>
  );
}

/**
 * Signed-out visitors still register the service worker, so Chromium deems the site installable
 * (beforeinstallprompt) and the app shell is cached before they sign in. No update UI here:
 * a waiting worker simply activates on a later load. Signed in, UpdatePrompt owns the SW.
 */
function useQuietServiceWorker(enabled: boolean) {
  useEffect(() => {
    if (!enabled || import.meta.env.DEV || !("serviceWorker" in navigator)) return;
    void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
  }, [enabled]);
}

function Splash() {
  return (
    <div className="auth-splash">
      <Spinner size={28} label="Loading your data" />
    </div>
  );
}

function Gate() {
  const { phase } = useSession();
  const route = useRoute();
  const entry = decideEntry({ phase, standalone: AS_APP, hashPath: route.path });
  const redirect = entry.view === "app" ? entry.redirectTo : undefined;
  useQuietServiceWorker(phase === "signedOut");

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  switch (entry.view) {
    case "loading":
      return <Splash />;
    case "landing":
      return (
        <Suspense fallback={<div className="auth-splash" />}>
          <Landing />
        </Suspense>
      );
    case "welcome":
      return (
        <Welcome
          key={entry.mode}
          initialMode={entry.mode}
          onBack={entry.standalone ? undefined : () => navigate("/")}
          appNote={
            entry.standalone && isIOS()
              ? "Signed in on Safari already? Home-screen apps on iPhone and iPad keep their own sign-in, so sign in once here. You'll stay signed in."
              : undefined
          }
        />
      );
    case "app":
      if (redirect) return <Splash />;
      return (
        <ActiveWorkoutProvider>
          <TutorialProvider>
            <Routed />
          </TutorialProvider>
          <SyncIssuesSheet />
        </ActiveWorkoutProvider>
      );
  }
}

export function App() {
  // Email links land on real paths (/auth/...?code=), not hash routes.
  const [link] = useState(emailLinkFromLocation);
  return (
    <ToastProvider>
      {link ? (
        <EmailLinkScreen kind={link.kind} code={link.code} />
      ) : (
        <SessionProvider>
          <Gate />
        </SessionProvider>
      )}
    </ToastProvider>
  );
}
