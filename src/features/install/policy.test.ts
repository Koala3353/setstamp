import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY,
  SNOOZE_MS,
  detectPlatform,
  neverAgain,
  parseMemory,
  shouldOfferInstall,
  snoozed,
  type OfferInput,
} from "./policy";

const NOW = Date.UTC(2026, 10, 24, 12);
const base: OfferInput = {
  standalone: false,
  installed: false,
  memory: EMPTY_MEMORY,
  now: NOW,
  onToday: true,
  workoutActive: false,
  shownThisSession: false,
};

describe("shouldOfferInstall", () => {
  it("offers on Today in a browser tab the first time", () => {
    expect(shouldOfferInstall(base)).toBe(true);
  });
  it("never offers inside the installed app", () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
  });
  it("never offers once installed", () => {
    expect(shouldOfferInstall({ ...base, installed: true })).toBe(false);
  });
  it("stays away off the Today screen and during a workout", () => {
    expect(shouldOfferInstall({ ...base, onToday: false })).toBe(false);
    expect(shouldOfferInstall({ ...base, workoutActive: true })).toBe(false);
  });
  it("shows at most once per page load", () => {
    expect(shouldOfferInstall({ ...base, shownThisSession: true })).toBe(false);
  });
  it("respects a 7-day snooze, then asks again", () => {
    const memory = snoozed(NOW);
    expect(memory.snoozeUntil).toBe(NOW + SNOOZE_MS);
    expect(shouldOfferInstall({ ...base, memory, now: NOW + 1000 })).toBe(false);
    expect(shouldOfferInstall({ ...base, memory, now: NOW + SNOOZE_MS - 1 })).toBe(false);
    expect(shouldOfferInstall({ ...base, memory, now: NOW + SNOOZE_MS })).toBe(true);
  });
  it("respects Don't ask again forever", () => {
    expect(shouldOfferInstall({ ...base, memory: neverAgain(), now: NOW + 10 * SNOOZE_MS })).toBe(false);
  });
});

describe("detectPlatform", () => {
  it("prefers iOS steps on iOS (no prompt API there)", () => {
    expect(detectPlatform({ ios: true, canPrompt: false })).toBe("ios");
  });
  it("uses the one-tap prompt when Chromium offered it", () => {
    expect(detectPlatform({ ios: false, canPrompt: true })).toBe("prompt");
  });
  it("falls back to browser-menu instructions", () => {
    expect(detectPlatform({ ios: false, canPrompt: false })).toBe("manual");
  });
});

describe("parseMemory", () => {
  it("reads what snoozed/neverAgain write", () => {
    expect(parseMemory(JSON.stringify(snoozed(NOW)))).toEqual({ snoozeUntil: NOW + SNOOZE_MS, never: false });
    expect(parseMemory(JSON.stringify(neverAgain()))).toEqual({ snoozeUntil: 0, never: true });
  });
  it("treats missing or corrupt values as never asked", () => {
    expect(parseMemory(null)).toEqual(EMPTY_MEMORY);
    expect(parseMemory("{oops")).toEqual(EMPTY_MEMORY);
    expect(parseMemory("42")).toEqual(EMPTY_MEMORY);
    expect(parseMemory('{"snoozeUntil":"soon","never":"yes"}')).toEqual(EMPTY_MEMORY);
  });
});
