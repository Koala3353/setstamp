import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { IconCheck } from "./icons";

/** Static tag (muscle, equipment). Not interactive. "iron" is the legacy name for "record". */
export function Chip({ children, tone = "neutral", icon, className }: { children: ReactNode; tone?: "neutral" | "iron" | "record" | "ok" | "warn" | "danger"; icon?: ReactNode; className?: string }) {
  return (
    <span className={cx("ui-chip", `ui-chip--${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}

export type FilterChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  selected: boolean;
  onChange: (selected: boolean) => void;
  /** Optional count shown after the label, e.g. matching results. */
  count?: number;
};

/** Toggle chip for filters. 40px visual, 44px hit area. */
export function FilterChip({ selected, onChange, count, children, className, ...rest }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx("ui-fchip", selected && "is-selected", className)}
      onClick={() => onChange(!selected)}
      {...rest}
    >
      {selected && <IconCheck size={16} />}
      <span>{children}</span>
      {count !== undefined && <span className="ui-fchip__count num">{count}</span>}
    </button>
  );
}

/** Horizontal, scrollable row of chips with edge padding that matches the gutter. */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ui-chiprow" role="group" aria-label={label}>
      {children}
    </div>
  );
}
