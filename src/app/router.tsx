// Tiny hash router. URLs look like "#/exercises/ex_bench_press?from=today".
// Hash routing keeps every deep link working offline from the cached index.html.
import { useSyncExternalStore, type AnchorHTMLAttributes } from "react";

export const ROUTES = {
  today: "/",
  program: "/program",
  exercises: "/exercises",
  exercise: "/exercises/:exId",
  progress: "/progress",
  settings: "/settings",
  workout: "/workout",
} as const;

export type RouteName = keyof typeof ROUTES;

export type Route = {
  name: RouteName | "notFound";
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
};

function currentPath(): string {
  const raw = window.location.hash.replace(/^#/, "");
  return raw.startsWith("/") ? raw : "/" + raw;
}

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    const val = s[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return params;
}

export function parse(hashPath: string): Route {
  const [pathPart = "/", queryPart = ""] = hashPath.split("?");
  const path = pathPart.length > 1 ? pathPart.replace(/\/+$/, "") : "/";
  const query = new URLSearchParams(queryPart);
  for (const [name, pattern] of Object.entries(ROUTES) as Array<[RouteName, string]>) {
    const params = match(pattern, path);
    if (params) return { name, path, params, query };
  }
  return { name: "notFound", path, params: {}, query };
}

let cached: { key: string; route: Route } | null = null;
function snapshot(): Route {
  const key = currentPath();
  if (!cached || cached.key !== key) cached = { key, route: parse(key) };
  return cached.route;
}
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Current route; re-renders on navigation. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** "/exercises" -> "#/exercises". Use for <a href>. */
export function href(to: string): string {
  return "#" + (to.startsWith("/") ? to : "/" + to);
}

/** Build a path from a route name and params: pathFor("exercise", { exId }) */
export function pathFor(name: RouteName, params: Record<string, string> = {}): string {
  return ROUTES[name].replace(/:([A-Za-z]+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
}

/** Navigate. replace=true swaps the current history entry (no back step). */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = href(to);
  if (opts.replace) {
    window.history.replaceState(window.history.state, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (window.location.hash !== target) {
    window.location.hash = target.slice(1);
  }
}

// History length when the app booted; anything above it was pushed by in-app navigation.
const baseLength = typeof window === "undefined" ? 1 : window.history.length;

/** Back if there is in-app history, else replace with `fallback` (never leaves the app). */
export function goBack(fallback = "/"): void {
  if (window.history.length > baseLength) window.history.back();
  else navigate(fallback, { replace: true });
}

export function Link({ to, ...rest }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string }) {
  return <a href={href(to)} {...rest} />;
}
