// SyncTransport backed by Convex. Function references are built by name ("sync:push", …) so this
// compiles whether or not convex/_generated/api has been regenerated yet; the names match the
// protocol contract: api.sync.push, api.sync.changes, api.catalog.meta, api.catalog.page.

import type { ConvexReactClient } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { ChangesResult, PushResult, SyncOp } from "../shared/sync";
import type { CatalogMeta, CatalogPage, SyncTransport } from "./types";

const refs = {
  push: makeFunctionReference<"mutation", { ops: SyncOp[] }, PushResult>("sync:push"),
  changes: makeFunctionReference<"query", { since: number; limit?: number }, ChangesResult>("sync:changes"),
  catalogMeta: makeFunctionReference<"query", Record<string, never>, CatalogMeta>("catalog:meta"),
  catalogPage: makeFunctionReference<"query", { cursor: string | null; numItems: number }, CatalogPage>(
    "catalog:page",
  ),
};

/** A fresh page gets this long to open its socket before we call it disconnected. */
const CONNECT_GRACE_MS = 4000;

export function createConvexTransport(client: ConvexReactClient): SyncTransport {
  const createdAt = Date.now();
  const isConnected = () => {
    const c = client.connectionState();
    if (c.isWebSocketConnected) return true;
    return !(c.hasEverConnected || Date.now() - createdAt > CONNECT_GRACE_MS);
  };
  return {
    isConnected,
    onConnectionChange(cb) {
      let last = isConnected();
      const check = () => {
        const now = isConnected();
        if (now !== last) {
          last = now;
          cb();
        }
      };
      const unsub = client.subscribeToConnectionState(check); // fires on every in-flight change too
      const t = setTimeout(check, CONNECT_GRACE_MS + 50); // the grace period ending is a change too
      return () => {
        clearTimeout(t);
        unsub();
      };
    },
    push: (ops) => client.mutation(refs.push, { ops }),
    changes: (since, limit) => client.query(refs.changes, limit === undefined ? { since } : { since, limit }),
    // Reactive: Convex re-runs the query when this user's rows change; we then pull pages.
    subscribe(since, onChange) {
      const watch = client.watchQuery(refs.changes, { since, limit: 1 });
      return watch.onUpdate(onChange);
    },
    catalogMeta: () => client.query(refs.catalogMeta, {}),
    catalogPage: (cursor, numItems) => client.query(refs.catalogPage, { cursor, numItems }),
  };
}
