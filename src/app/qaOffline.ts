// Dev-only QA switch that cuts the app off from Convex while the browser still reports itself
// online (the dead-gym-Wi-Fi case). Survives reloads via localStorage:
//   window.__qa.offline(true)   // or localStorage "qa:offline" = "1" before load
//   window.__qa.offline(false)  // reconnects on Convex's next retry
//   window.__qa.offline("os")   // also reports navigator.onLine = false and fires "offline"
// While on, new WebSockets point at a closed local port (they fail like a dead network), live ones
// are closed, and fetches to Convex hosts reject. Never bundled in production (import.meta.env.DEV).
const KEY = "qa:offline";

function mode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function installQaOffline(): void {
  const RealWS = window.WebSocket;
  const live = new Set<WebSocket>();
  class GatedWebSocket extends RealWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(mode() ? "ws://127.0.0.1:9/qa-offline" : url, protocols);
      live.add(this);
      this.addEventListener("close", () => live.delete(this));
    }
  }
  window.WebSocket = GatedWebSocket as typeof WebSocket;

  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (mode() && /\.convex\.(cloud|site)\b/.test(url)) return Promise.reject(new TypeError("Failed to fetch (qa:offline)"));
    return realFetch(input, init);
  };

  const realOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
  const applyOs = () => {
    if (mode() === "os") Object.defineProperty(Navigator.prototype, "onLine", { configurable: true, get: () => false });
    else if (realOnLine) Object.defineProperty(Navigator.prototype, "onLine", realOnLine);
  };
  applyOs();

  (window as unknown as { __qa: unknown }).__qa = {
    offline(on: boolean | "os") {
      try {
        if (on) localStorage.setItem(KEY, on === true ? "1" : on);
        else localStorage.removeItem(KEY);
      } catch {
        /* private mode */
      }
      applyOs();
      if (on) for (const ws of live) ws.close();
      window.dispatchEvent(new Event(on === "os" ? "offline" : "online"));
    },
  };
  if (mode()) console.warn(`[qa] offline mode "${mode()}" active: Convex traffic is blocked`);
}
