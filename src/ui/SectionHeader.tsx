import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Heading for a block within a screen: title, optional meta line, optional trailing action.
 * Sentence case; no eyebrows. level 2 = section, 3 = sub-block.
 */
export function SectionHeader({
  title,
  meta,
  aside,
  level = 2,
  id,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  /** Right side: a ghost Button, IconButton or a count. */
  aside?: ReactNode;
  level?: 2 | 3;
  id?: string;
  className?: string;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className={cx("ui-sechead", `ui-sechead--${level}`, className)}>
      <div className="ui-sechead__text">
        <H id={id} className="ui-sechead__title">
          {title}
        </H>
        {meta && <p className="ui-sechead__meta">{meta}</p>}
      </div>
      {aside && <div className="ui-sechead__aside">{aside}</div>}
    </div>
  );
}
