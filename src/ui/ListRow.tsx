import type { ReactNode } from "react";
import { cx } from "./cx";
import { IconChevronRight } from "./icons";

export type ListRowProps = {
  title: ReactNode;
  /** Secondary line: e.g. "3 × 8–10 · Barbell". */
  meta?: ReactNode;
  leading?: ReactNode;
  /** Right side: a value, a chip or a control. */
  trailing?: ReactNode;
  /** Show a chevron (implies navigation). Defaults to true when href is set. */
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Full-width row, minimum 56px. Renders an <a> with href, a <button> with onClick,
 * otherwise a plain <div>. Put rows inside <ListGroup> (a <ul>) and wrap each in <li>,
 * or use ListGroup's `items` children directly.
 */
export function ListRow({ title, meta, leading, trailing, chevron, onClick, href, disabled, className }: ListRowProps) {
  const showChevron = chevron ?? Boolean(href);
  const inner = (
    <>
      {leading && <span className="ui-row__leading">{leading}</span>}
      <span className="ui-row__text">
        <span className="ui-row__title">{title}</span>
        {meta && <span className="ui-row__meta">{meta}</span>}
      </span>
      {trailing && <span className="ui-row__trailing">{trailing}</span>}
      {showChevron && <IconChevronRight className="ui-row__chev" size={20} />}
    </>
  );
  const cls = cx("ui-row", (href || onClick) && "ui-row--action", className);
  if (href && !disabled) {
    return (
      <a className={cls} href={href}>
        {inner}
      </a>
    );
  }
  if (onClick || href) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** Grouped list on a surface, rows divided by 1px seams. */
export function ListGroup({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <ul className={cx("ui-list", className)} aria-label={label}>
      {children}
    </ul>
  );
}
