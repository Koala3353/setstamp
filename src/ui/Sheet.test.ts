import { describe, expect, it } from "vitest";
import { followVisualViewport, showSheetModal } from "./Sheet";

// Regression: showModal() focuses the close button while the panel is still parked below the
// screen (translateY(100%)). With `overflow: hidden` the dialog is a scroll container, so the
// browser scrolled it to reveal that button and the sheet opened in the wrong place until the
// next layout (on iOS Safari: until the next tap).

describe("Sheet opening position", () => {
  it("undoes any scroll the opening focus caused", () => {
    const dialog = {
      scrollTop: 0,
      scrollLeft: 0,
      showModal() {
        // What the browser does when it focuses the off-screen close button.
        this.scrollTop = 449;
        this.scrollLeft = 3;
      },
    };
    showSheetModal(dialog as unknown as HTMLDialogElement);
    expect(dialog.scrollTop).toBe(0);
    expect(dialog.scrollLeft).toBe(0);
  });
});

// Regression (Android tester, 360px phone): the superset picker opened with its left edge ~60% of
// the way across the screen once the search field took focus and the keyboard came up. The panel
// was centred in the dialog's box (left: 50% + translate), and the dialog spans the layout
// viewport, which Android widens past the screen when the page overflows sideways; focusing the
// field then panned the visible area across it. The panel now follows the visual viewport.
describe("Sheet follows the visible screen", () => {
  function fakeViewport(rect: { offsetLeft: number; offsetTop: number; width: number; height: number }) {
    const listeners = new Map<string, Set<() => void>>();
    return {
      ...rect,
      addEventListener(type: string, fn: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn);
      },
      fire(type: string) {
        listeners.get(type)?.forEach((fn) => fn());
      },
      count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    };
  }
  function fakeTarget() {
    const props = new Map<string, string>();
    return { props, style: { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => (props.delete(k), "") } };
  }

  it("places the panel where the user is looking, not at the middle of a widened layout viewport", () => {
    // Layout viewport widened to 916px by an overflowing row; the screen shows x 521–881.
    const vv = fakeViewport({ offsetLeft: 521, offsetTop: 0, width: 360, height: 740 });
    const el = fakeTarget();
    followVisualViewport(el as never, vv as never);
    expect(Object.fromEntries(el.props)).toEqual({ "--vv-x": "521px", "--vv-y": "0px", "--vv-w": "360px", "--vv-h": "740px" });
  });

  it("follows the keyboard opening and closing, then cleans up", () => {
    const vv = fakeViewport({ offsetLeft: 0, offsetTop: 0, width: 360, height: 740 });
    const el = fakeTarget();
    const stop = followVisualViewport(el as never, vv as never);
    Object.assign(vv, { height: 420, offsetTop: 120 }); // keyboard up, view panned
    vv.fire("resize");
    expect(el.props.get("--vv-h")).toBe("420px");
    expect(el.props.get("--vv-y")).toBe("120px");
    Object.assign(vv, { height: 740, offsetTop: 0 });
    vv.fire("scroll");
    expect(el.props.get("--vv-h")).toBe("740px");
    stop();
    expect(vv.count()).toBe(0);
    expect(el.props.size).toBe(0);
  });

  it("is a no-op without visualViewport (falls back to the dialog's box)", () => {
    const el = fakeTarget();
    followVisualViewport(el as never, undefined)();
    expect(el.props.size).toBe(0);
  });

  it("positions the panel from the variables, without the translate property", async () => {
    // Vitest turns CSS imports (even ?raw) into empty modules; read the file directly. No @types/node here.
    const fsModule: string = "node:fs";
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: URL, enc: "utf8") => string };
    const css = readFileSync(new URL("./ui.css", import.meta.url), "utf8");
    const panel = /\.ui-sheet__panel \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(panel).toMatch(/left:[^;]*var\(--vv-x/);
    expect(panel).toMatch(/bottom:[^;]*var\(--vv-y/);
    expect(panel).not.toMatch(/\btranslate:/);
  });
});
