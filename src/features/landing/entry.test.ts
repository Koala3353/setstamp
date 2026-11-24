import { describe, expect, it } from "vitest";
import { decideEntry, launchedAsApp } from "./entry";

describe("decideEntry", () => {
  it("sends signed-in users straight into the app, never the landing", () => {
    expect(decideEntry({ phase: "ready", standalone: false, hashPath: "/" })).toEqual({ view: "app" });
    expect(decideEntry({ phase: "ready", standalone: true, hashPath: "/progress" })).toEqual({ view: "app" });
  });
  it("moves a signed-in user off the sign-in URLs to Today", () => {
    expect(decideEntry({ phase: "ready", standalone: false, hashPath: "/signin" })).toEqual({ view: "app", redirectTo: "/" });
    expect(decideEntry({ phase: "ready", standalone: false, hashPath: "/signup/" })).toEqual({ view: "app", redirectTo: "/" });
  });
  it("waits while the session loads", () => {
    expect(decideEntry({ phase: "loading", standalone: false, hashPath: "/" })).toEqual({ view: "loading" });
  });
  it("shows the landing page to signed-out visitors at / in a browser", () => {
    expect(decideEntry({ phase: "signedOut", standalone: false, hashPath: "/" })).toEqual({ view: "landing" });
    expect(decideEntry({ phase: "signedOut", standalone: false, hashPath: "" })).toEqual({ view: "landing" });
  });
  it("never shows the landing inside the installed app", () => {
    expect(decideEntry({ phase: "signedOut", standalone: true, hashPath: "/" })).toEqual({ view: "welcome", mode: "signIn", standalone: true });
    expect(decideEntry({ phase: "signedOut", standalone: true, hashPath: "/signup" })).toEqual({ view: "welcome", mode: "signUp", standalone: true });
  });
  it("routes the landing CTAs to the right form", () => {
    expect(decideEntry({ phase: "signedOut", standalone: false, hashPath: "/signup" })).toEqual({ view: "welcome", mode: "signUp", standalone: false });
    expect(decideEntry({ phase: "signedOut", standalone: false, hashPath: "/signin" })).toEqual({ view: "welcome", mode: "signIn", standalone: false });
  });
  it("sends signed-out deep links to sign in", () => {
    expect(decideEntry({ phase: "signedOut", standalone: false, hashPath: "/exercises/ex_1" })).toEqual({ view: "welcome", mode: "signIn", standalone: false });
  });
});

describe("launchedAsApp", () => {
  it("trusts display-mode standalone", () => {
    expect(launchedAsApp({ displayStandalone: true, search: "" })).toBe(true);
  });
  it("recognises the manifest start_url marker", () => {
    expect(launchedAsApp({ displayStandalone: false, search: "?source=pwa" })).toBe(true);
    expect(launchedAsApp({ displayStandalone: false, search: "?source=email" })).toBe(false);
    expect(launchedAsApp({ displayStandalone: false, search: "" })).toBe(false);
  });
});
