import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A stamped figure with its label: "Top set  100 kg × 5". Value uses tabular, condensed numerals.
 * Use `note` to say what a number is ("estimated", "last 7 days").
 */
export function Stat({
  label,
  value,
  unit,
  note,
  size = "md",
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  /** md = 28px figure, lg = 44px figure. */
  size?: "md" | "lg";
  /** record = record blue (PRs); ok = green (done). */
  tone?: "default" | "record" | "ok";
  className?: string;
}) {
  return (
    <div className={cx("ui-stat", size === "lg" && "ui-stat--lg", tone !== "default" && `ui-stat--${tone}`, className)}>
      <p className="ui-stat__value num">
        <span>{value}</span>
        {unit && <span className="ui-stat__unit">{unit}</span>}
      </p>
      <span className="ui-stat__label">{label}</span>
      {note && <span className="ui-stat__note">{note}</span>}
    </div>
  );
}

/** Responsive grid of Stats (2-up on phones). */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-statgrid", className)}>{children}</div>;
}
