import { describe, expect, it } from "vitest";
import { showSheetModal } from "./Sheet";

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
