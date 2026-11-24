import type { ReactNode } from "react";
import { cx } from "./cx";

/** Teaches what goes here and offers the one action that fills it. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  framed = false,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Dashed outline marking a slot that will fill (e.g. "Up next"). Default: unframed. */
  framed?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("ui-empty", framed && "ui-empty--framed", className)}>
      {icon && <div className="ui-empty__icon">{icon}</div>}
      <h3 className="ui-empty__title">{title}</h3>
      {children && <div className="ui-empty__body">{children}</div>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}
