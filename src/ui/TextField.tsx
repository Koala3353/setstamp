import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  /** Help under the field. */
  hint?: ReactNode;
  /** Error message: names the problem and the fix. Sets aria-invalid. */
  error?: ReactNode;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
};

/** Labelled 52px text input with hint and error wired to aria-describedby. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, hideLabel, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  const describedBy = [rest["aria-describedby"], hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("ui-field", className)}>
      <label htmlFor={inputId} className={cx("ui-field__label", hideLabel && "sr-only")}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className="ui-field__input"
        {...rest}
        aria-invalid={error ? true : rest["aria-invalid"]}
        aria-describedby={describedBy}
      />
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="ui-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
