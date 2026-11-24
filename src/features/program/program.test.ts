import { describe, expect, it } from "vitest";
import type { ProgramData } from "../../shared/sync";
import { FIXTURE } from "../coverage/fixture";
import { applyCompletion, moveToDay, nextDay, reconcileCompletions, replaceDays, skipDay, timeline } from "./schedule";
import { buildFromTemplate, isNearDuplicate, newSlot, pickForSpec, TEMPLATES } from "./templates";
import { describeSlot } from "./format";

let n = 0;
const id = () => `id${++n}`;

describe("pickForSpec / buildFromTemplate", () => {
  const legs = TEMPLATES.find((t) => t.id === "ppl3")!.days[2]!;
  it("picks staples for a full gym", () => {
    expect(pickForSpec(legs.slots[0]!, FIXTURE, [])?.exId).toBe("ex_barbell_back_squat");
    expect(pickForSpec(legs.slots[1]!, FIXTURE, [])?.exId).toMatch(/romanian_deadlift/);
  });
  it("respects available equipment", () => {
    const squat = pickForSpec(legs.slots[0]!, FIXTURE, ["dumbbell"]);
    expect(squat?.equipment.every((e) => e === "dumbbell" || e === "bodyweight")).toBe(true);
    expect(pickForSpec(legs.slots[0]!, FIXTURE, ["band"])?.exId).toBe("ex_bodyweight_squat");
  });
  it("builds every template without repeating an exercise inside a day", () => {
    for (const t of TEMPLATES) {
      const { data } = buildFromTemplate(t.id, FIXTURE, [], id);
      expect(data.nextDayIndex).toBe(0);
      expect(data.scheduleLog).toEqual([]);
      if (t.id === "custom") expect(data.days).toHaveLength(1);
      else expect(data.days).toHaveLength(t.days.length);
      for (const d of data.days) {
        const ids = d.slots.map((s) => s.exId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
  it("reports slots it couldn't fill instead of inventing exercises", () => {
    const { unfilled, data } = buildFromTemplate("upper_lower", FIXTURE, ["band"], id);
    expect(unfilled.length).toBeGreaterThan(0);
    for (const d of data.days) for (const s of d.slots) expect(FIXTURE.find((e) => e.exId === s.exId)).toBeTruthy();
  });
  it("does not fill two slots of a day with variants of the same movement", () => {
    // Rope and straight-bar pushdowns are the same cable movement; the second triceps slot
    // on Push should get a different one (QA: PPL picked both).
    const pushdown = FIXTURE.find((e) => e.exId === "ex_triceps_pushdown")!;
    const catalog = [...FIXTURE, { ...pushdown, exId: "ex_rope_triceps_pushdown", name: "Rope Triceps Pushdown" }];
    const { data } = buildFromTemplate("ppl3", catalog, [], id);
    const push = data.days[0]!.slots.map((s) => catalog.find((e) => e.exId === s.exId)!);
    const triceps = push.filter((e) => e.primary[0] === "triceps" && e.pattern === "isolation_upper");
    expect(triceps).toHaveLength(2);
    expect(isNearDuplicate(triceps[0]!, triceps[1]!)).toBe(false);
  });
  it("near-duplicate means same family on the same implement", () => {
    const a = { exId: "a", family: "triceps_extension", equipment: ["cable"] as const };
    expect(isNearDuplicate({ ...a, equipment: [...a.equipment] }, { exId: "b", family: "triceps_extension", equipment: ["cable"] })).toBe(true);
    expect(isNearDuplicate({ ...a, equipment: ["cable"] }, { exId: "c", family: "triceps_extension", equipment: ["dumbbell", "bench"] })).toBe(false);
    expect(isNearDuplicate({ ...a, equipment: ["cable"] }, { exId: "d", family: null, equipment: ["cable"] })).toBe(false);
  });
  it("uses seconds for hold exercises", () => {
    const { data } = buildFromTemplate("upper_lower", FIXTURE, [], id);
    for (const d of data.days) for (const s of d.slots) expect(s.repMin == null).toBe(s.durationSec != null);
  });
});

const prog = (): ProgramData => ({
  name: "UL",
  template: "upper_lower",
  days: ["Upper A", "Lower A", "Upper B", "Lower B"].map((name, i) => ({ dayId: `d${i}`, name, slots: [] })),
  nextDayIndex: 0,
  preferredWeekdays: [],
  archived: false,
  scheduleLog: [],
});

describe("rolling schedule", () => {
  it("skip advances, wraps and logs without touching days", () => {
    let p = prog();
    const days = p.days;
    for (let i = 0; i < 5; i++) p = skipDay(p, i);
    expect(p.nextDayIndex).toBe(1);
    expect(p.days).toBe(days);
    expect(p.scheduleLog.map((e) => e.action)).toEqual(Array(5).fill("skipped"));
  });
  it("moving brings a day up next; completing it continues from there", () => {
    let p = moveToDay(prog(), "d2", 10);
    expect(nextDay(p)?.day.name).toBe("Upper B");
    p = applyCompletion(p, "d2", "s1", 20);
    expect(nextDay(p)?.day.name).toBe("Lower B");
    expect(p.scheduleLog.map((e) => e.action)).toEqual(["moved", "completed"]);
  });
  it("completion is idempotent per session", () => {
    const p = applyCompletion(prog(), "d0", "s1", 1);
    expect(applyCompletion(p, "d0", "s1", 2)).toBe(p);
  });
  it("reconciles finished sessions in order and ignores other programs and open sessions", () => {
    const sessions = [
      { cid: "s2", data: { programCid: "P", dayId: "d1", endedAt: 200 } },
      { cid: "s1", data: { programCid: "P", dayId: "d0", endedAt: 100 } },
      { cid: "s3", data: { programCid: "P", dayId: "d2", endedAt: null } },
      { cid: "s4", data: { programCid: "Q", dayId: "d3", endedAt: 300 } },
    ];
    const p = reconcileCompletions("P", prog(), sessions);
    expect(p.scheduleLog.map((e) => e.sessionCid)).toEqual(["s1", "s2"]);
    expect(nextDay(p)?.day.name).toBe("Upper B");
    expect(reconcileCompletions("P", p, sessions)).toBe(p);
  });
  it("editing days keeps the same day up next", () => {
    const p = { ...prog(), nextDayIndex: 2 };
    const reordered = replaceDays(p, [p.days[2]!, p.days[0]!, p.days[1]!, p.days[3]!]);
    expect(nextDay(reordered)?.day.dayId).toBe("d2");
    const removed = replaceDays(p, p.days.filter((d) => d.dayId !== "d2"));
    expect(nextDay(removed)?.day.dayId).toBe("d3");
  });
  it("timeline shows newest first and names removed days", () => {
    let p = skipDay(prog(), 1);
    p = applyCompletion(p, "d1", "s1", 2);
    p = replaceDays(p, p.days.filter((d) => d.dayId !== "d0"));
    const t = timeline(p);
    expect(t.map((x) => x.action)).toEqual(["completed", "skipped"]);
    expect(t[1]!.dayName).toBe("Removed day");
  });
});

describe("slots for the new tracking types", () => {
  it("a weighted hold gets a hold target; a carry gets no rep target", () => {
    const hold = newSlot({ exId: "ex_kb_rack_hold", tracking: "weight_duration", mechanic: null }, "a");
    expect([hold.durationSec, hold.repMin]).toEqual([30, null]);
    const carry = newSlot({ exId: "ex_farmers_walk", tracking: "weight_distance", mechanic: "compound" }, "b");
    expect([carry.durationSec, carry.repMin, carry.repMax]).toEqual([null, null, null]);
    expect(describeSlot(carry, 90).startsWith("3 sets")).toBe(true);
  });
});
