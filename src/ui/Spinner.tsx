import type { CSSProperties } from "react";
import { cx } from "./cx";

/** Indeterminate spinner. Pass label="" when the parent already announces the busy state. */
export function Spinner({ size = 20, label = "Loading", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span
      className={cx("ui-spinner", className)}
      style={{ "--spinner-size": `${size}px` } as CSSProperties}
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Placeholder block for content that is loading. Purely visual; announce loading elsewhere. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--r-sm)",
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
}) {
  return <span className={cx("ui-skeleton", className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** A list-row-shaped skeleton, for lists that are loading. */
export function SkeletonRows({ count = 4, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="ui-skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="ui-skeleton-row">
          <Skeleton width={40} height={40} radius="var(--r-sm)" />
          <div className="ui-skeleton-row__text">
            <Skeleton width={`${62 - ((i * 13) % 24)}%`} height={14} />
            <Skeleton width={`${36 - ((i * 7) % 12)}%`} height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}
