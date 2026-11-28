// Rest alerts when the app is closed or the phone is locked: Web Push from Convex.
//
// The browser's push subscription is saved to the server (push.saveSubscription). Every rest start
// or change schedules one push for its end time (push.scheduleRestAlert, which replaces the
// previous one); skip/dismiss cancels it. public/rest-push-sw.js shows the notification.
// Offline or not subscribed: nothing is sent and the local alert in restTimer.ts is all there is.
//
// Never asks for permission on its own: only the Settings switch and the one-time offer next to
// the rest bar call enablePush, from a tap.
import { useEffect, useSyncExternalStore } from "react";
import { useQuery, type ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { isIOS, isStandalone } from "../settings/install";
import { getRest, setRestRemote } from "./restTimer";

export type PushSupport = "supported" | "ios-needs-install" | "unsupported";
export type PushPermission = NotificationPermission | "unsupported";

/** Same tag as public/rest-push-sw.js, so a local and a pushed alert replace each other. */
const TAG = "setstamp-rest";
const OFFER_KEY = "gym.restPush.offer";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  // iOS/iPadOS (16.4+) only delivers web push to the app opened from the Home Screen.
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return "supported";
}

function currentPermission(): PushPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

type Snap = { permission: PushPermission; endpoint: string | null; offerDismissed: boolean };

let snap: Snap = { permission: currentPermission(), endpoint: null, offerDismissed: readOfferDismissed() };
const listeners = new Set<() => void>();

function update(patch: Partial<Snap>) {
  snap = { ...snap, ...patch };
  for (const l of [...listeners]) l();
}

function readOfferDismissed(): boolean {
  try {
    return localStorage.getItem(OFFER_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissPushOffer() {
  try {
    localStorage.setItem(OFFER_KEY, "1");
  } catch {
    /* storage blocked: the offer may show again next time */
  }
  update({ offerDismissed: true });
}

async function registration(waitMs = 0): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg || waitMs === 0) return reg ?? null;
  // The worker is registered a moment after load; never hang if it never comes (dev builds).
  return await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
}

let refreshed = false;
/** Read this browser's current subscription (once per page load unless forced). */
export async function refreshPush(force = false) {
  if (refreshed && !force) return;
  refreshed = true;
  update({ permission: currentPermission() });
  if (pushSupport() !== "supported") return;
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    update({ endpoint: sub?.endpoint ?? null });
  } catch {
    update({ endpoint: null });
  }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options?.applicationServerKey;
  if (!k) return true; // can't tell; keep it
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}

export type EnableResult = "on" | "denied" | "dismissed" | "unsupported" | "unavailable" | "error";

/**
 * Ask for notification permission and subscribe. Call straight from a tap: Safari only shows the
 * permission prompt when the request is the first thing the gesture does.
 */
export async function enablePush(client: ConvexReactClient, publicKey: string): Promise<EnableResult> {
  if (pushSupport() !== "supported") return "unsupported";
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return "error";
  }
  update({ permission });
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  try {
    const reg = await registration(5000);
    if (!reg) return "unavailable";
    const key = keyBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys.auth) return "error";
    await client.mutation(api.push.saveSubscription, { endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
    update({ endpoint: sub.endpoint });
    // A rest that is already counting down gets its alert too.
    const r = getRest();
    if (r && r.endsAt > Date.now()) remote?.schedule(r.endsAt, r.label);
    return "on";
  } catch {
    return "error";
  }
}

export async function disablePush(client: ConvexReactClient) {
  const endpoint = snap.endpoint;
  update({ endpoint: null });
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* the server copy is what matters */
  }
  if (endpoint) {
    try {
      await client.mutation(api.push.cancelRestAlert, {});
      await client.mutation(api.push.removeSubscription, { endpoint });
    } catch {
      /* offline: the push service reports the dead endpoint as gone on the next send */
    }
  }
}

// --- RestRemote: schedule / cancel / local fallback ------------------------

let remote: { schedule(endsAt: number, label: string): void; cancel(): void } | null = null;
let installedFor: ConvexReactClient | null = null;
/** The server confirmed a push for the current rest, so the local notification can stay quiet. */
let armed = false;
/** A schedule was sent (maybe not answered yet), so a skip must send a cancel. */
let sent = false;
let seq = 0;

function canReachServer() {
  return snap.endpoint !== null && (typeof navigator === "undefined" || navigator.onLine !== false);
}

async function showLocalNotification(label: string) {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") return; // the in-app state covers it
  if (currentPermission() !== "granted") return;
  try {
    const reg = await registration();
    await reg?.showNotification("Rest over", {
      body: label || "Time for your next set.",
      tag: TAG,
      icon: new URL("icons/icon-192.png", reg.scope).href,
      // renotify and vibrate are missing from TypeScript's NotificationOptions.
      ...({ renotify: true, vibrate: [220, 120, 220, 120, 220] } as object),
    });
  } catch {
    /* best effort */
  }
}

/** Connect restTimer to the server. Idempotent; the app has one Convex client. */
export function installRestRemote(client: ConvexReactClient) {
  void refreshPush();
  if (installedFor === client) return;
  installedFor = client;
  remote = {
    schedule(endsAt, label) {
      const token = ++seq;
      armed = false;
      if (!canReachServer()) return;
      sent = true;
      client
        .mutation(api.push.scheduleRestAlert, { endsAt, label, endpoint: snap.endpoint ?? undefined })
        .then((ok) => {
          if (token === seq) armed = ok;
        })
        .catch(() => {});
    },
    cancel() {
      ++seq;
      const wasSent = sent;
      armed = false;
      sent = false;
      if (!wasSent || !canReachServer()) return;
      client.mutation(api.push.cancelRestAlert, {}).catch(() => {});
    },
  };
  setRestRemote({
    schedule: (endsAt, label) => remote?.schedule(endsAt, label),
    cancel: () => remote?.cancel(),
    ended(label) {
      const pushed = armed;
      armed = false;
      if (!pushed) void showLocalNotification(label);
    },
  });
}

// --- React -------------------------------------------------------------------

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type RestPushState = {
  support: PushSupport;
  permission: PushPermission;
  /** Push is set up on the server (VAPID keys present). Undefined while loading. */
  available: boolean | undefined;
  publicKey: string | null;
  /** This browser is subscribed and the server has it for the signed-in user. */
  on: boolean;
  offerDismissed: boolean;
};

export function useRestPush(): RestPushState {
  const s = useSyncExternalStore(subscribe, () => snap, () => snap);
  useEffect(() => {
    void refreshPush();
  }, []);
  const config = useQuery(api.push.config, {});
  const registered = useQuery(api.push.isSubscribed, s.endpoint ? { endpoint: s.endpoint } : "skip");
  return {
    support: pushSupport(),
    permission: s.permission,
    available: config === undefined ? undefined : config.publicKey !== null,
    publicKey: config?.publicKey ?? null,
    on: s.permission === "granted" && s.endpoint !== null && registered !== false,
    offerDismissed: s.offerDismissed,
  };
}
