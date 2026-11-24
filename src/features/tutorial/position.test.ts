import { describe, expect, it } from "vitest";
import { placeCard, sameBox, spotlightRect } from "./position";

const phone = { width: 375, height: 812 };

describe("spotlightRect", () => {
  it("pads the target and keeps it on screen", () => {
    expect(spotlightRect({ top: 100, left: 20, width: 100, height: 40 }, phone, 6)).toEqual({ top: 94, left: 14, width: 112, height: 52 });
    const edge = spotlightRect({ top: 2, left: 0, width: 375, height: 30 }, phone, 6);
    expect(edge.top).toBe(0);
    expect(edge.left).toBe(0);
    expect(edge.width).toBe(375);
  });
});

describe("placeCard", () => {
  const card = { width: 360, height: 220 };

  it("goes below a target near the top", () => {
    const p = placeCard({ target: { top: 80, left: 16, width: 343, height: 48 }, card, viewport: phone });
    expect(p.placement).toBe("below");
    expect(p.top).toBe(80 + 48 + 12);
  });

  it("flips above a target in the bottom tab bar", () => {
    const tab = { top: 744, left: 190, width: 90, height: 68 };
    const p = placeCard({ target: tab, card, viewport: phone });
    expect(p.placement).toBe("above");
    expect(p.top + 220).toBeLessThanOrEqual(744 - 12);
  });

  it("fits a 375px screen with 16px gutters and stays on screen horizontally", () => {
    const p = placeCard({ target: { top: 300, left: 330, width: 40, height: 40 }, card, viewport: phone });
    expect(p.width).toBe(343);
    expect(p.left).toBe(16);
    expect(p.left + p.width).toBeLessThanOrEqual(375 - 16);
  });

  it("caps width on wide screens and centers on the target", () => {
    const p = placeCard({ target: { top: 100, left: 500, width: 200, height: 40 }, card, viewport: { width: 1280, height: 800 } });
    expect(p.width).toBe(360);
    expect(p.left).toBe(600 - 180);
  });

  it("uses the roomier side when neither fits, clamped inside the viewport", () => {
    const tall = { width: 360, height: 500 };
    const p = placeCard({ target: { top: 300, left: 16, width: 343, height: 200 }, card: tall, viewport: phone });
    expect(p.top).toBeGreaterThanOrEqual(16);
    expect(p.top + 500).toBeLessThanOrEqual(812 - 16);
  });

  it("centers when there's no target or it's scrolled away", () => {
    expect(placeCard({ target: null, card, viewport: phone }).placement).toBe("center");
    expect(placeCard({ target: { top: -400, left: 0, width: 100, height: 40 }, card, viewport: phone }).placement).toBe("center");
    const c = placeCard({ target: null, card, viewport: phone });
    expect(c.top).toBe(Math.round((812 - 220) / 2));
  });
});

describe("sameBox", () => {
  it("ignores sub-pixel jitter", () => {
    expect(sameBox({ top: 1, left: 1, width: 10, height: 10 }, { top: 1.2, left: 1, width: 10, height: 10 })).toBe(true);
    expect(sameBox({ top: 1, left: 1, width: 10, height: 10 }, { top: 3, left: 1, width: 10, height: 10 })).toBe(false);
    expect(sameBox(null, null)).toBe(true);
  });
});
