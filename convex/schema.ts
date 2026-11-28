import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { catalogExerciseFields, vRowData, vSyncTable } from "./validators";

/** Live (non-tombstoned) row counts per sync table, maintained by sync.push. */
export const vRowCounts = v.object({
  settings: v.number(),
  favorites: v.number(),
  customExercises: v.number(),
  programs: v.number(),
  sessions: v.number(),
  sessionExercises: v.number(),
  sets: v.number(),
});

export default defineSchema({
  // App-owned users table. Convex Auth v2 keeps credentials, sessions and
  // verified emails inside its own components; it only stores the id that
  // users.createUser* returns.
  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    // "emailPassword" | "google": the method that created the account.
    createdBy: v.string(),
  }),

  // Shared, read-only catalog (written only by internal mutations).
  exercises: defineTable(catalogExerciseFields).index("by_exId", ["exId"]).index("by_status", ["status"]),

  // Single document describing the imported catalog.
  catalogMeta: defineTable({
    key: v.literal("catalog"),
    version: v.string(),
    builtAt: v.string(),
    counts: v.any(),
    sources: v.any(),
    curated: v.optional(v.any()),
    schema: v.optional(v.number()),
    importedAt: v.number(),
  }).index("by_key", ["key"]),

  // Generic private store for every synced table.
  userRows: defineTable({
    ownerId: v.id("users"),
    table: vSyncTable,
    cid: v.string(),
    updatedAt: v.number(),
    deleted: v.boolean(),
    seq: v.number(),
    data: vRowData,
  })
    .index("by_owner_table_cid", ["ownerId", "table", "cid"])
    .index("by_owner_seq", ["ownerId", "seq"]),

  // One per user: the monotonic seq counter (serializes pushes via OCC).
  syncState: defineTable({
    ownerId: v.id("users"),
    seq: v.number(),
    counts: v.optional(vRowCounts),
    // Rows with seq <= purgedThrough belong to a deleteAllData in progress:
    // they are treated as gone and removed by a background purge.
    purgedThrough: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  // Web Push subscriptions for rest alerts, one per browser/device that turned them on.
  // Deleted when turned off, when the push service reports them gone (404/410), and with the account.
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // The one pending "rest over" push per user (rescheduling cancels the previous one).
  restAlerts: defineTable({
    userId: v.id("users"),
    scheduledId: v.id("_scheduled_functions"),
    endsAt: v.number(),
  }).index("by_user", ["userId"]),

  // Outgoing mail queue for the Apps Script webhook. Rows are deleted after
  // delivery (or after their final failure), so links never linger.
  mailOutbox: defineTable({
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
    attempts: v.number(),
  }),
});
