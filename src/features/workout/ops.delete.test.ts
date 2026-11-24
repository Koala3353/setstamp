import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { CustomExerciseData, ProgramData, SessionData, SetData } from "../../shared/sync";
import { FakeServer } from "../../sync/fakeServer";
import { newCid, SyncStore } from "../../sync/store";
import { loggedExercises, workoutHistory } from "../progress/model";
import { SETTINGS_CID, updateSettings } from "../session/hooks";
import {
  deleteCustomExercise,
  deleteProgram,
  deleteSession,
  moveToDate,
  restoreRows,
  setProgramArchived,
  updateSessionDetails,
} from "./ops";

const open: SyncStore[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

async function newStore(server = new FakeServer(), user = `ops-${newCid()}`) {
  const s = await SyncStore.open({ userKey: user, transport: server.transport(user) });
  open.push(s);
  return { s, server, user };
}

const session = (over: Partial<SessionData> = {}): SessionData => ({
  startedAt: Date.UTC(2026, 10, 20, 17, 0),
  endedAt: Date.UTC(2026, 10, 20, 18, 0),
  name: "Push",
  programCid: null,
  dayId: null,
  notes: "",
  bodyweightKg: null,
  ...over,
});

const set = (sessionCid: string, sessionExerciseCid: string, order: number, over: Partial<SetData> = {}): SetData => ({
  sessionCid,
  sessionExerciseCid,
  exId: "ex_bench",
  order,
  kind: "working",
  weightKg: 100,
  entered: { value: 100, unit: "kg" },
  reps: 5,
  assistKg: null,
  durationSec: null,
  distanceM: null,
  rpe: null,
  done: true,
  completedAt: Date.UTC(2026, 10, 20, 17, 10 + order),
  ...over,
});

const program = (over: Partial<ProgramData> = {}): ProgramData => ({
  name: "PPL",
  template: "ppl",
  days: [{ dayId: "d1", name: "Push", slots: [] }],
  nextDayIndex: 0,
  preferredWeekdays: [],
  archived: false,
  scheduleLog: [],
  ...over,
});

/** A finished session with 2 exercises × 2 sets, plus an unrelated session that must survive. */
async function seed(s: SyncStore) {
  await s.write("sessions", "s1", session());
  await s.write("sessions", "s2", session({ name: "Legs", startedAt: Date.UTC(2026, 10, 18, 17), endedAt: Date.UTC(2026, 10, 18, 18) }));
  for (const [se, exId, order] of [["se1", "ex_bench", 0], ["se2", "ex_row", 1]] as const) {
    await s.write("sessionExercises", se, { sessionCid: "s1", exId, order, slotId: null, substitutedFromExId: null, notes: "", restSec: null });
    await s.write("sets", `${se}-a`, set("s1", se, 0, { exId }));
    await s.write("sets", `${se}-b`, set("s1", se, 1, { exId }));
  }
  await s.write("sessionExercises", "se3", { sessionCid: "s2", exId: "ex_squat", order: 0, slotId: null, substitutedFromExId: null, notes: "", restSec: null });
  await s.write("sets", "se3-a", set("s2", "se3", 0, { exId: "ex_squat" }));
}

describe("deleteSession", () => {
  it("tombstones the session, its exercises and its sets, and nothing else", async () => {
    const { s } = await newStore();
    await seed(s);
    const snap = await deleteSession(s, "s1");

    expect(s.get("sessions", "s1")).toBeUndefined();
    expect(s.list("sessionExercises").map((r) => r.cid)).toEqual(["se3"]);
    expect(s.list("sets").map((r) => r.cid)).toEqual(["se3-a"]);
    expect(s.get("sessions", "s2")).toBeDefined();
    expect(snap.filter((r) => r.table === "sets")).toHaveLength(4);
    expect(snap.filter((r) => r.table === "sessionExercises")).toHaveLength(2);
  });

  it("undo restores every row exactly", async () => {
    const { s } = await newStore();
    await seed(s);
    const before = { ses: s.get("sessions", "s1")!.data, sets: s.list("sets").map((r) => [r.cid, r.data] as const) };
    const snap = await deleteSession(s, "s1");
    await restoreRows(s, snap);

    expect(s.get("sessions", "s1")!.data).toEqual(before.ses);
    expect(new Map(s.list("sets").map((r) => [r.cid, r.data]))).toEqual(new Map(before.sets));
    expect(s.list("sessionExercises")).toHaveLength(3);
  });

  it("restored rows win over the tombstones (newer updatedAt)", async () => {
    const { s } = await newStore();
    await seed(s);
    const snap = await deleteSession(s, "s1");
    const tomb = (await s.getOutbox()).find((e) => e.cid === "s1")!.op.updatedAt;
    await restoreRows(s, snap);
    const restored = (await s.getOutbox()).find((e) => e.cid === "s1")!.op;
    expect(restored.deleted).toBe(false);
    expect(restored.updatedAt).toBeGreaterThan(tomb);
  });

  it("another device drops the deleted workout after sync", async () => {
    const server = new FakeServer();
    const user = `ops-${newCid()}`;
    const { s: a } = await newStore(server, user);
    const { s: b } = await newStore(server, user);
    await seed(a);
    await a.flush();
    await b.pull();
    expect(b.list("sets")).toHaveLength(5);

    await deleteSession(a, "s1");
    await a.flush();
    await b.pull();
    expect(b.get("sessions", "s1")).toBeUndefined();
    expect(b.list("sets").map((r) => r.cid)).toEqual(["se3-a"]);
  });

  it("derived history and exercise stats no longer count it", async () => {
    const { s } = await newStore();
    await seed(s);
    await deleteSession(s, "s1");
    const tracking = () => "weight_reps" as const;
    expect(workoutHistory(s.list("sessions"), s.list("sets"), tracking).map((h) => h.cid)).toEqual(["s2"]);
    expect(loggedExercises(s.list("sets"), s.list("sessions")).map((e) => e.exId)).toEqual(["ex_squat"]);
  });
});

describe("editing a finished session", () => {
  it("moveToDate keeps the time of day and changes only the date", () => {
    const at = new Date(2026, 10, 20, 17, 45).getTime();
    expect(moveToDate(at, "2026-11-02")).toBe(new Date(2026, 10, 2, 17, 45).getTime());
    expect(moveToDate(at, "not a date")).toBe(at);
  });

  it("moving the date shifts the end and every set's completion time by the same amount", async () => {
    const { s } = await newStore();
    await seed(s);
    const old = s.get("sessions", "s1")!.data!;
    const newStart = old.startedAt - 3 * 86_400_000;
    await updateSessionDetails(s, "s1", { name: "Push A", notes: "felt strong", startedAt: newStart });

    const now = s.get("sessions", "s1")!.data!;
    expect(now).toMatchObject({ name: "Push A", notes: "felt strong", startedAt: newStart, endedAt: old.endedAt! - 3 * 86_400_000 });
    expect(s.get("sets", "se1-a")!.data!.completedAt).toBe(set("s1", "se1", 0).completedAt! - 3 * 86_400_000);
    expect(s.get("sets", "se3-a")!.data!.completedAt).toBe(set("s2", "se3", 0).completedAt);
  });
});

describe("deleteProgram / archive", () => {
  it("deleting the active program clears settings.activeProgramCid; undo brings both back", async () => {
    const { s } = await newStore();
    await s.write("programs", "p1", program());
    await updateSettings(s, { activeProgramCid: "p1", unit: "lb" });

    const snap = await deleteProgram(s, "p1");
    expect(s.get("programs", "p1")).toBeUndefined();
    expect(s.get("settings", SETTINGS_CID)!.data!.activeProgramCid).toBeNull();
    expect(s.get("settings", SETTINGS_CID)!.data!.unit).toBe("lb");

    await restoreRows(s, snap);
    expect(s.get("programs", "p1")!.data!.name).toBe("PPL");
    expect(s.get("settings", SETTINGS_CID)!.data!.activeProgramCid).toBe("p1");
  });

  it("deleting another program leaves the active one alone", async () => {
    const { s } = await newStore();
    await s.write("programs", "p1", program());
    await s.write("programs", "p2", program({ name: "Old" }));
    await updateSettings(s, { activeProgramCid: "p1" });
    const snap = await deleteProgram(s, "p2");
    expect(s.get("settings", SETTINGS_CID)!.data!.activeProgramCid).toBe("p1");
    expect(snap.some((r) => r.table === "settings")).toBe(false);
  });

  it("keeps sessions that came from the program", async () => {
    const { s } = await newStore();
    await s.write("programs", "p1", program());
    await s.write("sessions", "s1", session({ programCid: "p1", dayId: "d1" }));
    await deleteProgram(s, "p1");
    expect(s.get("sessions", "s1")).toBeDefined();
  });

  it("archiving the active program deactivates it; unarchive keeps it inactive", async () => {
    const { s } = await newStore();
    await s.write("programs", "p1", program());
    await updateSettings(s, { activeProgramCid: "p1" });
    await setProgramArchived(s, "p1", true);
    expect(s.get("programs", "p1")!.data!.archived).toBe(true);
    expect(s.get("settings", SETTINGS_CID)!.data!.activeProgramCid).toBeNull();
    await setProgramArchived(s, "p1", false);
    expect(s.get("programs", "p1")!.data!.archived).toBe(false);
    expect(s.get("settings", SETTINGS_CID)!.data!.activeProgramCid).toBeNull();
  });
});

describe("deleteCustomExercise", () => {
  const cx = (exId: string): CustomExerciseData => ({
    exId,
    name: "Landmine press",
    aliases: [],
    equipment: ["barbell"],
    primary: ["chest"],
    secondary: [],
    pattern: "push_horizontal" as CustomExerciseData["pattern"],
    tracking: "weight_reps",
    unilateral: false,
    notes: "",
  });

  it("tombstones it and its favorite, keeps logged sets; undo restores both", async () => {
    const { s } = await newStore();
    await s.write("customExercises", "c1", cx("cx_c1"));
    await s.write("favorites", "fav_cx_c1", { exId: "cx_c1" });
    await s.write("favorites", "fav_ex_bench", { exId: "ex_bench" });
    await s.write("sets", "x", set("s1", "se1", 0, { exId: "cx_c1" }));

    const snap = await deleteCustomExercise(s, "c1");
    expect(s.get("customExercises", "c1")).toBeUndefined();
    expect(s.list("favorites").map((r) => r.cid)).toEqual(["fav_ex_bench"]);
    expect(s.get("sets", "x")).toBeDefined();

    await restoreRows(s, snap);
    expect(s.get("customExercises", "c1")).toBeDefined();
    expect(s.list("favorites")).toHaveLength(2);
  });
});
