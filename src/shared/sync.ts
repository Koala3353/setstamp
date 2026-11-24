// Sync protocol shared by the Convex backend (convex/sync.ts) and the device outbox (src/sync/).
// Every private row is identified by a client-generated UUID `cid` and owned by one user.
// Writes are idempotent upserts keyed by (ownerId, table, cid); last-writer-wins on `updatedAt`
// (client clock, ms); `deleted: true` is a tombstone. The server stamps a per-user monotonically
// increasing `seq` on every accepted write so `changes(since)` never misses a row.

import type { Equipment, Muscle, Pattern, Tracking, Unit } from "./domain";

export const SYNC_TABLES = [
  "settings",
  "favorites",
  "customExercises",
  "programs",
  "sessions",
  "sessionExercises",
  "sets",
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export type SettingsData = {
  unit: Unit;
  bodyweightKg: number | null;
  availableEquipment: Equipment[]; // empty = "full gym" (no restriction)
  defaultRestSec: number;
  barKg: number; // default barbell weight for plate calc
  platesKg: number[]; // available plates per side, in kg (lb plates stored converted)
  showCommunityImages: boolean; // free-exercise-db images (unverified provenance)
  activeProgramCid: string | null;
  goal: "strength" | "hypertrophy" | "general" | null;
  sessionMinutes: number | null;
};

export type FavoriteData = { exId: string };

export type CustomExerciseData = {
  exId: string; // "cx_" + cid
  name: string;
  aliases: string[];
  equipment: Equipment[];
  primary: Muscle[];
  secondary: Muscle[];
  pattern: Pattern;
  tracking: Tracking;
  unilateral: boolean;
  notes: string;
};

export type PlannedSlot = {
  slotId: string;
  exId: string;
  sets: number;
  repMin: number | null;
  repMax: number | null;
  durationSec: number | null;
  restSec: number | null;
  warmup: boolean; // suggest warm-up sets for this slot
  notes: string;
  alternates: string[]; // exIds the user pre-approved as substitutes
};

export type ProgramDay = { dayId: string; name: string; slots: PlannedSlot[] };

export type ProgramData = {
  name: string;
  template: "upper_lower" | "ppl" | "full_body" | "custom";
  days: ProgramDay[];
  /** Rolling schedule: days are done in order; `nextDayIndex` advances on completion or skip. */
  nextDayIndex: number;
  /** Optional preferred weekdays (0=Sun) — guidance only, never blocks. */
  preferredWeekdays: number[];
  archived: boolean;
  /** Append-only log of schedule decisions so skips/moves never destroy the plan. */
  scheduleLog: Array<{ at: number; dayId: string; action: "completed" | "skipped" | "moved"; sessionCid: string | null }>;
};

export type SessionData = {
  startedAt: number;
  endedAt: number | null;
  name: string;
  programCid: string | null;
  dayId: string | null; // planned day this session came from, if any
  notes: string;
  bodyweightKg: number | null;
};

export type SessionExerciseData = {
  sessionCid: string;
  exId: string;
  order: number;
  slotId: string | null; // planned slot it fulfils
  substitutedFromExId: string | null;
  notes: string;
  restSec: number | null;
};

export type SetData = {
  sessionCid: string;
  sessionExerciseCid: string;
  exId: string; // denormalized for history queries
  order: number;
  kind: "warmup" | "working" | "drop" | "failure";
  weightKg: number | null; // canonical
  entered: { value: number; unit: Unit } | null; // as typed, to avoid lb<->kg drift
  reps: number | null;
  assistKg: number | null; // assisted exercises: assistance, positive
  durationSec: number | null;
  distanceM: number | null;
  rpe: number | null;
  done: boolean;
  completedAt: number | null;
};

export type SyncDataMap = {
  settings: SettingsData;
  favorites: FavoriteData;
  customExercises: CustomExerciseData;
  programs: ProgramData;
  sessions: SessionData;
  sessionExercises: SessionExerciseData;
  sets: SetData;
};

export type SyncOp<T extends SyncTable = SyncTable> = {
  opId: string; // unique per op, for client bookkeeping
  table: T;
  cid: string;
  updatedAt: number;
  deleted: boolean;
  data: SyncDataMap[T] | null; // null allowed only when deleted
};

export type PushResult = {
  applied: string[]; // opIds accepted OR ignored as stale (both are "done", never retry)
  rejected: Array<{ opId: string; reason: string }>; // validation failures: do not retry blindly
  seq: number;
};

export type SyncRow<T extends SyncTable = SyncTable> = {
  table: T;
  cid: string;
  updatedAt: number;
  deleted: boolean;
  seq: number;
  data: SyncDataMap[T] | null;
};

export type ChangesResult = { rows: SyncRow[]; seq: number; hasMore: boolean };

export const PUSH_BATCH_MAX = 100;
export const CHANGES_PAGE = 500;
