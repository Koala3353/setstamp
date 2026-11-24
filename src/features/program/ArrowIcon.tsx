// Reorder arrow in the house icon style (24px grid, 2px square-capped strokes). Kept local to
// Program: a chevron here read as "open", next to the row's own navigation chevron.
import type { SVGProps } from "react";

export function IconArrow({ dir, size = 20, ...rest }: Omit<SVGProps<SVGSVGElement>, "children"> & { dir: "up" | "down"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      style={dir === "down" ? { transform: "rotate(180deg)" } : undefined}
      {...rest}
    >
      <path d="M12 19.5V5M6 10.5l6-6 6 6" />
    </svg>
  );
}
