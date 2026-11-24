// Placement math for the tour's spotlight and card. Pure, so it's tested without a browser.

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

export type Placement = "below" | "above" | "center";

/** The cutout around a target: padded, rounded off to whole pixels, kept inside the viewport. */
export function spotlightRect(target: Box, viewport: Size, pad = 6): Box {
  const top = Math.max(0, Math.floor(target.top - pad));
  const left = Math.max(0, Math.floor(target.left - pad));
  const bottom = Math.min(viewport.height, Math.ceil(target.top + target.height + pad));
  const right = Math.min(viewport.width, Math.ceil(target.left + target.width + pad));
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export type CardPlacement = { top: number; left: number; width: number; placement: Placement };

/**
 * Where the card goes. Below the target when it fits, else above, else whichever side has more
 * room (clamped on screen). No target, or a target off screen: centered.
 * `margin` is the screen gutter; `gap` the space between cutout and card; the card is never
 * wider than `maxWidth` or the viewport minus both gutters.
 */
export function placeCard(opts: { target: Box | null; card: Size; viewport: Size; margin?: number; gap?: number; maxWidth?: number }): CardPlacement {
  const { target, card, viewport } = opts;
  const margin = opts.margin ?? 16;
  const gap = opts.gap ?? 12;
  const width = Math.min(opts.maxWidth ?? 360, Math.max(0, viewport.width - margin * 2));
  const height = card.height;
  const centered = (): CardPlacement => ({
    top: Math.max(margin, Math.round((viewport.height - height) / 2)),
    left: Math.round((viewport.width - width) / 2),
    width,
    placement: "center",
  });

  const visible = target && target.top + target.height > 0 && target.top < viewport.height && target.width > 0 && target.height > 0;
  if (!target || !visible) return centered();

  const spaceBelow = viewport.height - (target.top + target.height) - gap - margin;
  const spaceAbove = target.top - gap - margin;
  let placement: Placement;
  if (spaceBelow >= height) placement = "below";
  else if (spaceAbove >= height) placement = "above";
  else placement = spaceBelow >= spaceAbove ? "below" : "above";

  const rawTop = placement === "below" ? target.top + target.height + gap : target.top - gap - height;
  const top = Math.round(clamp(rawTop, margin, viewport.height - height - margin));
  const centerX = target.left + target.width / 2;
  const left = Math.round(clamp(centerX - width / 2, margin, viewport.width - width - margin));
  return { top, left, width, placement };
}

function clamp(v: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, v));
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
