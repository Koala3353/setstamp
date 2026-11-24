import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "default" | "raised" | "record" | "danger";

export type CardProps = HTMLAttributes<HTMLElement> & {
  /** Element to render. Use "section"/"article" for landmarks, "a"/"button" via `interactive`. */
  as?: "div" | "section" | "article" | "li";
  tone?: CardTone;
  /** 16px inner padding (default true). Turn off when the card holds a ListGroup or full-bleed content. */
  padded?: boolean;
  children: ReactNode;
};

/**
 * A plate: one flat surface holding one idea. Never nest cards; group rows with ListGroup.
 * tone="record" adds a record-blue marking bar on top (PRs, bests).
 * tone="danger" outlines in red; pair with .ui-hazard only for irreversible actions.
 */
export function Card({ as: Tag = "div", tone = "default", padded = true, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cx("ui-card", tone !== "default" && `ui-card--${tone}`, padded && "ui-card--padded", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** A whole-plate tap target (opens a detail). Renders a <button>, or an <a> when href is set. */
export function CardButton({
  href,
  onClick,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const cls = cx("ui-card", "ui-card--padded", "ui-card--interactive", className);
  if (href) {
    return (
      <a className={cls} href={href} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
