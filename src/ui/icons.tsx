// Original inline icon set ("Station Stencil"). 24px grid, 2px strokes with square caps and
// mitred joins, like marks cut from sheet steel: open strokes, few nodes, fills only where a
// solid reads better at small size.
import type { ReactNode, SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 24, ...rest }: IconProps & { children: ReactNode }) {
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
      strokeMiterlimit={8}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

/** Today: a loaded barbell seen side-on. */
export const IconToday = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12h19" />
    <rect x="5" y="6.5" width="3" height="11" rx="1" />
    <rect x="16" y="6.5" width="3" height="11" rx="1" />
    <path d="M3 9.5v5M21 9.5v5" />
  </Svg>
);

/** Program: the rolling queue of days, stations on one line. */
export const IconProgram = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19V5" />
    <circle cx="4" cy="6" r="1.6" fill="currentColor" />
    <circle cx="4" cy="12" r="1.6" fill="currentColor" />
    <circle cx="4" cy="18" r="1.6" fill="currentColor" />
    <path d="M9 6h11M9 12h8M9 18h10" />
  </Svg>
);

/** Exercises: search. */
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.5 5.5" />
  </Svg>
);

/** Progress: a stepped climb with a marker on the top step. */
export const IconProgress = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20h4v-5h4v-4h4V7h5" />
    <path d="M3 20h18" opacity="0.5" />
  </Svg>
);

/** Settings: two sliders. */
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
    <circle cx="15" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconMinus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

/** Done: a stamped tick. */
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconUndo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 8H4V3" />
    <path d="M4.5 8A8 8 0 1 1 5 16" />
  </Svg>
);

/** Rest timer: a stopwatch. */
export const IconTimer = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5M10 2.5h4M18.5 6.5l1.5-1.5" />
  </Svg>
);

export const IconCloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5Z" />
  </Svg>
);

export const IconCloudOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.5 6.3A5.5 5.5 0 0 1 17.6 10.54 4 4 0 0 1 19.8 17.6M15 18.5H7a4.5 4.5 0 0 1-.9-8.9" />
    <path d="M3 3l18 18" />
  </Svg>
);

/** Saved on this device: a phone with a tick. */
export const IconDevice = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="m9.5 12 2 2 3.5-4" />
  </Svg>
);

export const IconSync = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15a8 8 0 0 0 14.5 1.5" />
    <path d="M19.5 4v5h-5M4.5 20v-5h5" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5" />
    <circle cx="12" cy="17.3" r="0.6" fill="currentColor" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12.5-7.5L7 4.5Z" fill="currentColor" />
  </Svg>
);

/** Dumbbell, for exercise rows and empty states. */
export const IconDumbbell = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 12h8" />
    <rect x="4.5" y="7" width="3.5" height="10" rx="1" />
    <rect x="16" y="7" width="3.5" height="10" rx="1" />
    <path d="M2.5 10v4M21.5 10v4" />
  </Svg>
);

/** Info: how-to and details for an exercise. */
export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
  </Svg>
);

/** Personal record: a plate with a notch. */
export const IconRecord = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 3.5v3" />
  </Svg>
);

export const IconHistory = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5v4.5h4.5" />
    <path d="M4.6 9.5A8 8 0 1 1 4 13" />
    <path d="M12 8v4.5l3 2" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
  </Svg>
);
