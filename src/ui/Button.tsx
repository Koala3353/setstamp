import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = tape yellow; use once per screen region for the next action. */
  variant?: ButtonVariant;
  /** md = 48px, lg = 56px. */
  size?: ButtonSize;
  /** Stretch to the container width. */
  block?: boolean;
  /** Shows a spinner, keeps the label for width, sets aria-busy and disables. */
  loading?: boolean;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, trailingIcon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("ui-btn", `ui-btn--${variant}`, `ui-btn--${size}`, block && "ui-btn--block", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} label="" /> : icon}
      <span className="ui-btn__label">{children}</span>
      {trailingIcon}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Required accessible name. */
  label: string;
  icon: ReactNode;
  variant?: "plain" | "raised";
  /** 44px (default) or 56px. */
  size?: "md" | "lg";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "plain", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx("ui-iconbtn", `ui-iconbtn--${variant}`, `ui-iconbtn--${size}`, className)}
      {...rest}
    >
      {icon}
    </button>
  );
});
