import { useEffect, useRef, type ReactNode } from "react";
import { IconButton, IconChevronLeft, IconProgram, IconProgress, IconSearch, IconSettings, IconToday, SectionHeader, SyncStatus, cx } from "../ui";
import { IconHelp, useTutorial } from "../features/tutorial";
import { useActiveWorkout } from "./activeWorkout";
import { goBack, href, navigate, useRoute, type RouteName } from "./router";
import { useShellSyncStatus } from "./syncSource";
import { formatDuration, useNow } from "./useNow";

const TABS: Array<{ name: RouteName; path: string; label: string; Icon: typeof IconToday; match: RouteName[] }> = [
  { name: "today", path: "/", label: "Today", Icon: IconToday, match: ["today"] },
  { name: "program", path: "/program", label: "Program", Icon: IconProgram, match: ["program"] },
  { name: "exercises", path: "/exercises", label: "Exercises", Icon: IconSearch, match: ["exercises", "exercise"] },
  { name: "progress", path: "/progress", label: "Progress", Icon: IconProgress, match: ["progress"] },
];

// Keep in sync with --tabbar-h and .workout-bar height in app.css.
const TABBAR_H = 68;
const BAR_H = 64;

const currentKey = () => {
  const raw = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
  const path = raw.startsWith("/") ? raw : "/" + raw;
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
};

/** Screens that sit "inside" a tab and show a back button instead of the tab bar title. */
const SUBSCREENS: Partial<Record<RouteName, { back: string }>> = {
  settings: { back: "/" },
  workout: { back: "/" },
  exercise: { back: "/exercises" },
};

export function Shell({ title, children }: { title: string; children: ReactNode }) {
  const route = useRoute();
  const sync = useShellSyncStatus();
  const { session } = useActiveWorkout();
  const { openHelp } = useTutorial();
  const name = route.name === "notFound" ? null : route.name;
  const sub = name ? SUBSCREENS[name] : undefined;
  const inWorkout = name === "workout";
  // Today already shows the open session with its own "Continue workout" action; a second
  // orange Resume there would break the one-orange rule.
  const showBar = Boolean(session) && !inWorkout && name !== "today";
  const showTabs = !inWorkout;

  // Screen changes: scroll to top and move focus to the new heading (announces the screen).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  // Back/forward returns to where the screen was left (e.g. the workout after a peek at an exercise).
  const scrolls = useRef(new Map<string, number>());
  // Read at popstate, before the incoming screen renders and the browser clamps the scroll.
  const restore = useRef<number | undefined>(undefined);
  useEffect(() => {
    const onPop = () => (restore.current = scrolls.current.get(currentKey()));
    const onScroll = () => scrolls.current.set(currentKey(), window.scrollY);
    window.addEventListener("popstate", onPop);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => {
    const saved = restore.current;
    restore.current = undefined;
    if (saved) requestAnimationFrame(() => window.scrollTo(0, saved));
    else window.scrollTo(0, 0);
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [route.path]);

  // Toasts and screen actions sit above whatever is docked at the bottom.
  const dockH = (showTabs ? TABBAR_H : 0) + (showBar ? BAR_H : 0);
  useEffect(() => {
    document.documentElement.style.setProperty("--dock-h", `${dockH}px`);
  }, [dockH]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="shell-header">
        {sub && <IconButton label="Back" icon={<IconChevronLeft />} onClick={() => goBack(sub.back)} />}
        <h1 ref={headingRef} tabIndex={-1} className={cx("shell-title display", sub && "shell-title--sub")}>
          {title}
        </h1>
        <div className="shell-header__end">
          <SyncStatus status={sync} />
          <IconButton label="Help" icon={<IconHelp />} onClick={openHelp} />
          {name !== "settings" && <IconButton label="Settings" icon={<IconSettings />} onClick={() => navigate("/settings")} />}
        </div>
      </header>

      <main id="main" className="shell-main">
        {children}
      </main>

      <div className="shell-dock">
        {showBar && session && <ActiveWorkoutBar name={session.name} startedAt={session.startedAt} setsDone={session.setsDone} />}
        {showTabs && (
          <nav className="tabbar" aria-label="Main">
            {TABS.map(({ name: tab, path, label, Icon, match }) => {
              const active = name !== null && match.includes(name);
              return (
                <a key={tab} href={href(path)} className={cx("tabbar__tab", active && "is-active")} aria-current={active ? "page" : undefined}>
                  <span className="tabbar__plate" aria-hidden="true">
                    <Icon size={24} />
                  </span>
                  <span className="tabbar__label">{label}</span>
                </a>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

function ActiveWorkoutBar({ name, startedAt, setsDone }: { name: string; startedAt: number; setsDone: number }) {
  const now = useNow(1000);
  const elapsed = formatDuration((now - startedAt) / 1000);
  return (
    <a className="workout-bar" href={href("/workout")} aria-label={`Workout in progress: ${name}, ${elapsed} elapsed, ${setsDone} sets done. Open workout.`}>
      <span className="workout-bar__dot" aria-hidden="true" />
      <span className="workout-bar__text" aria-hidden="true">
        <span className="workout-bar__name">{name}</span>
        <span className="workout-bar__meta num">
          {elapsed} · {setsDone} {setsDone === 1 ? "set" : "sets"}
        </span>
      </span>
      <span className="workout-bar__cta" aria-hidden="true">
        Resume
      </span>
    </a>
  );
}

/** Docked primary action for a screen, kept in the thumb zone above the tab bar. */
export function ScreenAction({ children }: { children: ReactNode }) {
  return <div className="screen-action">{children}</div>;
}

/** Titled section within a screen. */
export function Section({
  title,
  aside,
  meta,
  children,
  id,
}: {
  title: string;
  aside?: ReactNode;
  /** Optional line under the title (what the section shows, or what a number means). */
  meta?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <SectionHeader id={id} title={title} meta={meta} aside={aside} className="section__head" />
      {children}
    </section>
  );
}
