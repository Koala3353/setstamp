import { describe, expect, it } from "vitest";
import { RESHOW_BELOW_VERSION, TUTORIAL_VERSION, canGoNext, freshTour, parseStored, reduce, startupDecision, type Snapshot, type TourState } from "./machine";

const today: Snapshot = { route: "today", openSessionCid: null, exerciseCount: 0, doneSetCount: 0 };
const snap = (p: Partial<Snapshot>): Snapshot => ({ ...today, ...p });

function run(s: TourState, ...steps: Array<[Parameters<typeof reduce>[1], Snapshot]>): TourState {
  return steps.reduce((cur, [e, sn]) => reduce(cur, e, sn), s);
}

describe("tour state machine", () => {
  it("walks the whole tour on real app events", () => {
    let s = freshTour();
    s = reduce(s, { type: "next" }, today);
    expect(s.step).toBe("start");
    expect(s.sawNoWorkout).toBe(true);

    // Starting a workout lands on /workout with no exercises.
    const w = snap({ route: "workout", openSessionCid: "w1" });
    s = reduce(s, { type: "snapshot", snap: w });
    expect(s.step).toBe("add");
    expect(s.practiceCid).toBe("w1");

    s = reduce(s, { type: "snapshot", snap: { ...w, exerciseCount: 1 } });
    expect(s.step).toBe("log");
    s = reduce(s, { type: "snapshot", snap: { ...w, exerciseCount: 1, doneSetCount: 1 } });
    expect(s.step).toBe("edit");

    const logged = { ...w, exerciseCount: 1, doneSetCount: 1 };
    s = reduce(s, { type: "next" }, logged);
    expect(s.step).toBe("wrap");
    s = reduce(s, { type: "discarded" }, today);
    expect(s.step).toBe("progressTab");
    expect(s.practiceCid).toBeNull();

    s = reduce(s, { type: "snapshot", snap: snap({ route: "progress" }) });
    expect(s.step).toBe("bodymap");
    s = reduce(s, { type: "app", name: "muscle" }, snap({ route: "progress" }));
    expect(s.step).toBe("exercisesTab");
    s = reduce(s, { type: "snapshot", snap: snap({ route: "exercises" }) });
    expect(s.step).toBe("favorite");
    s = reduce(s, { type: "app", name: "favorite" }, snap({ route: "exercises" }));
    expect(s.step).toBe("done");
    s = reduce(s, { type: "next" }, snap({ route: "exercises" }));
    expect(s.status).toBe("done");
  });

  it("ignores app signals meant for another step", () => {
    const s = { ...freshTour(), step: "log" as const };
    expect(reduce(s, { type: "app", name: "favorite" }, snap({ route: "workout", openSessionCid: "w" })).step).toBe("log");
  });

  it("does not advance an action step on Next-free events", () => {
    let s = reduce(freshTour(), { type: "next" }, today);
    s = reduce(s, { type: "snapshot", snap: snap({ route: "program" }) });
    expect(s.step).toBe("start");
  });

  it("never claims a workout that was already open as practice", () => {
    const open = snap({ route: "today", openSessionCid: "real" });
    const s = reduce(freshTour(), { type: "next" }, open);
    expect(s.step).toBe("add");
    expect(s.practiceCid).toBeNull();
  });

  it("counts adding from where the add step began (program days start with exercises)", () => {
    const day = snap({ route: "workout", openSessionCid: "w", exerciseCount: 5 });
    let s = run(freshTour(), [{ type: "next" }, today], [{ type: "snapshot", snap: day }, day]);
    expect(s.step).toBe("add");
    expect(s.baseExercises).toBe(5);
    expect(canGoNext("add", day)).toBe(true);
    s = reduce(s, { type: "snapshot", snap: { ...day, exerciseCount: 6 } });
    expect(s.step).toBe("log");
  });

  it("treats a program day's exercises arriving after the workout opens as the starting point", () => {
    let s = reduce(freshTour(), { type: "next" }, today);
    const opened = snap({ route: "workout", openSessionCid: "w", exerciseCount: 0 });
    s = reduce(s, { type: "snapshot", snap: opened });
    expect(s.step).toBe("add");
    s = reduce(s, { type: "snapshot", snap: { ...opened, exerciseCount: 6 } });
    expect(s.step).toBe("add");
    expect(s.baseExercises).toBe(6);
    s = reduce(s, { type: "snapshot", snap: { ...opened, exerciseCount: 7 } });
    expect(s.step).toBe("log");
  });

  it("skips from any step and drops the practice claim", () => {
    const s = { ...freshTour(), step: "log" as const, practiceCid: "w" };
    const out = reduce(s, { type: "skip" });
    expect(out.status).toBe("skipped");
    expect(out.practiceCid).toBeNull();
    // Finished tours ignore further events.
    expect(reduce(out, { type: "next" }, today)).toBe(out);
  });

  it("moves past wrap when the workout is finished from the workout screen", () => {
    const s = { ...freshTour(), step: "wrap" as const, practiceCid: "w" };
    const out = reduce(s, { type: "snapshot", snap: today });
    expect(out.step).toBe("progressTab");
    expect(out.practiceCid).toBeNull();
  });

  it("gates Next on action steps", () => {
    expect(canGoNext("start", today)).toBe(false);
    expect(canGoNext("log", today)).toBe(false);
    expect(canGoNext("add", today)).toBe(false);
    expect(canGoNext("edit", today)).toBe(true);
    expect(canGoNext("bodymap", today)).toBe(true);
  });
});

describe("resume after reload", () => {
  it("round-trips through storage and resumes on the same step", () => {
    const mid: TourState = { ...freshTour(), step: "log", practiceCid: "w1", sawNoWorkout: true, baseExercises: 0 };
    const back = parseStored(JSON.stringify(mid));
    expect(back).toEqual(mid);
    expect(startupDecision(back, false)).toBe("resume");
    // The reloaded app is still mid-workout with nothing logged: stays on log.
    const w = snap({ route: "workout", openSessionCid: "w1", exerciseCount: 1 });
    expect(reduce(back!, { type: "snapshot", snap: w }).step).toBe("log");
  });

  it("catches up if the step was done while the page was away", () => {
    const mid: TourState = { ...freshTour(), step: "log", practiceCid: "w1" };
    const w = snap({ route: "workout", openSessionCid: "w1", exerciseCount: 1, doneSetCount: 2 });
    expect(reduce(mid, { type: "snapshot", snap: w }).step).toBe("edit");
  });

  it("reads junk as no record", () => {
    expect(parseStored(null)).toBeNull();
    expect(parseStored("nope")).toBeNull();
    expect(parseStored(JSON.stringify({ version: 1, status: "weird" }))).toBeNull();
    expect(parseStored(JSON.stringify({ version: 1, status: "active", step: "gone" }))?.step).toBe("welcome");
  });
});

describe("startup decision", () => {
  const done = (version: number, status: "done" | "skipped" = "done"): TourState => ({ ...freshTour(), version, status, step: "done" });

  it("starts once for a new account only", () => {
    expect(startupDecision(null, true)).toBe("start");
    expect(startupDecision(null, false)).toBe("none");
  });

  it("stays quiet after finishing or skipping the current version", () => {
    expect(startupDecision(done(TUTORIAL_VERSION), true)).toBe("none");
    expect(startupDecision(done(TUTORIAL_VERSION, "skipped"), true)).toBe("none");
  });

  it("re-shows after a version bump only when the reshow floor is raised past it", () => {
    // A newer tour version alone (copy fix) doesn't re-show to people who saw an older one…
    const seenOld = done(RESHOW_BELOW_VERSION);
    expect(startupDecision(seenOld, false)).toBe("none");
    // …but anything below the floor does.
    expect(startupDecision(done(RESHOW_BELOW_VERSION - 1), false)).toBe("start");
  });

  it("restarts a tour that was mid-way under an older version", () => {
    const old: TourState = { ...freshTour(), version: TUTORIAL_VERSION - 1, step: "log" };
    expect(startupDecision(old, false)).toBe("start");
  });
});
