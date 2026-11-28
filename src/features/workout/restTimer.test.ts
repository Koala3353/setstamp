import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// restTimer reads localStorage when it loads, so each test imports a fresh copy of the module.
class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

let storage: MemoryStorage;
const T0 = new Date("2026-11-28T10:00:00Z").getTime();

async function load() {
  vi.resetModules();
  return await import("./restTimer");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rest timer", () => {
  test("countdown, then over (counting up), then clears itself after 5 minutes", async () => {
    const m = await load();
    const remote = { schedule: vi.fn(), cancel: vi.fn(), ended: vi.fn() };
    m.setRestRemote(remote);
    m.rest.start(90, "Squat");
    expect(remote.schedule).toHaveBeenCalledWith(T0 + 90_000, "Squat");
    expect(m.restPhase(m.getRest(), Date.now())).toBe("running");

    vi.advanceTimersByTime(89_999);
    expect(m.restPhase(m.getRest(), Date.now())).toBe("running");
    expect(remote.ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    // The bar stays: the state is still there and now reads "over".
    expect(m.getRest()).not.toBeNull();
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");
    expect(remote.ended).toHaveBeenCalledWith("Squat");

    vi.advanceTimersByTime(m.REST_OVER_KEEP_MS - 1);
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");
    vi.advanceTimersByTime(1);
    expect(m.getRest()).toBeNull();
    expect(storage.getItem("gym.rest.v1")).toBeNull();
    // Clearing on its own is not a user cancel: the push already went out.
    expect(remote.cancel).not.toHaveBeenCalled();
  });

  test("dismiss and skip clear the state and cancel the remote alert; the next start replaces it", async () => {
    const m = await load();
    const remote = { schedule: vi.fn(), cancel: vi.fn() };
    m.setRestRemote(remote);
    m.rest.start(30, "Bench");
    vi.advanceTimersByTime(40_000);
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");
    m.rest.dismiss();
    expect(m.getRest()).toBeNull();
    expect(remote.cancel).toHaveBeenCalledTimes(1);

    m.rest.start(60, "Row");
    m.rest.start(120, "Deadlift");
    expect(m.getRest()?.label).toBe("Deadlift");
    expect(m.getRest()?.endsAt).toBe(Date.now() + 120_000);
    m.rest.skip();
    expect(m.getRest()).toBeNull();
    expect(remote.cancel).toHaveBeenCalledTimes(2);
    // Skipping with nothing running doesn't call the server.
    m.rest.skip();
    expect(remote.cancel).toHaveBeenCalledTimes(2);
  });

  test("adjust reschedules; taking it past zero ends the rest now", async () => {
    const m = await load();
    const remote = { schedule: vi.fn(), cancel: vi.fn() };
    m.setRestRemote(remote);
    m.rest.start(20, "Curl");
    m.rest.adjust(15);
    expect(m.getRest()?.endsAt).toBe(T0 + 35_000);
    expect(remote.schedule).toHaveBeenLastCalledWith(T0 + 35_000, "Curl");
    m.rest.adjust(-15);
    m.rest.adjust(-15);
    m.rest.adjust(-15);
    expect(m.getRest()?.endsAt).toBe(T0);
    expect(remote.cancel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(0);
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");
    // No adjusting once it's over.
    m.rest.adjust(15);
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");
  });

  test("persists across reload: countdown resumes, over state survives, stale state is dropped", async () => {
    let m = await load();
    m.rest.start(60, "Press");
    vi.advanceTimersByTime(20_000);
    m = await load(); // reload mid-countdown
    expect(m.getRest()).toMatchObject({ endsAt: T0 + 60_000, label: "Press" });
    const ended = vi.fn();
    m.setRestRemote({ schedule: vi.fn(), cancel: vi.fn(), ended });
    vi.advanceTimersByTime(40_000);
    expect(ended).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    m = await load(); // reload while "Rest over" is showing
    expect(m.restPhase(m.getRest(), Date.now())).toBe("over");

    vi.setSystemTime(T0 + 60_000 + m.REST_OVER_KEEP_MS + 1);
    m = await load(); // reopened long after
    expect(m.getRest()).toBeNull();

    storage.setItem("gym.rest.v1", "{not json");
    m = await load();
    expect(m.getRest()).toBeNull();
  });

  test("sound is on unless the user turned it off", async () => {
    let m = await load();
    expect(m.soundEnabled()).toBe(true);
    m.setSoundEnabled(false);
    m = await load();
    expect(m.soundEnabled()).toBe(false);
    m.setSoundEnabled(true);
    expect(m.soundEnabled()).toBe(true);
  });
});
