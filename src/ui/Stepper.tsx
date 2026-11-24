import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "./cx";
import { IconMinus, IconPlus } from "./icons";

export type StepperProps = {
  /** Visible label, e.g. "Weight" or "Reps". */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  /** "decimal" for loads (2.5, 1.25), "numeric" for whole counts (reps, seconds). */
  inputMode?: "decimal" | "numeric";
  /** Unit shown after the number, e.g. "kg", "lb", "reps", "s". */
  unit?: string;
  /** Placeholder when empty, e.g. last session's value "100". */
  placeholder?: string;
  /** Optional hint under the control, e.g. "Last time: 100 × 8". */
  hint?: string;
  disabled?: boolean;
  className?: string;
};

const REPEAT_DELAY = 400;
const REPEAT_START = 140;
const REPEAT_MIN = 45;

function roundTo(n: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((Math.round(n / step) * step).toFixed(decimals));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function format(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Big −/+ stepper around a direct numeric input.
 * - Tap −/+ to step; press and hold to repeat (accelerates).
 * - Tap the number to type; the keypad is numeric/decimal; the text is selected on focus.
 * - Arrow keys step, Shift+Arrow steps ×10. Commas are accepted as decimal points.
 */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  inputMode = "numeric",
  unit,
  placeholder,
  hint,
  disabled,
  className,
}: StepperProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [draft, setDraft] = useState(format(value));
  const editing = useRef(false);
  const justFocused = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!editing.current) setDraft(format(value));
  }, [value]);

  const bump = useCallback(
    (dir: 1 | -1, mult = 1) => {
      const base = valueRef.current ?? (placeholder ? Number(placeholder.replace(",", ".")) || 0 : 0);
      const next = clamp(roundTo(base + dir * step * mult, step), min, max);
      valueRef.current = next;
      onChange(next);
    },
    [max, min, onChange, placeholder, step],
  );

  // Press-and-hold repeat.
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = (dir: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    bump(dir);
    let interval = REPEAT_START;
    const tick = () => {
      bump(dir);
      interval = Math.max(REPEAT_MIN, interval * 0.85);
      timer.current = window.setTimeout(tick, interval);
    };
    timer.current = window.setTimeout(tick, REPEAT_DELAY);
  };

  const onKeyStep = (dir: 1 | -1) => (e: KeyboardEvent<HTMLButtonElement>) => {
    // Pointer handles mouse/touch; keyboard activation (Enter/Space) arrives as click with detail 0.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      bump(dir);
    }
  };

  const commit = () => {
    editing.current = false;
    const raw = draft.trim().replace(",", ".");
    if (raw === "") {
      onChange(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(format(value));
      return;
    }
    const next = clamp(inputMode === "numeric" ? Math.round(n) : n, min, max);
    setDraft(format(next));
    onChange(next);
  };

  const atMin = value !== null && value <= min;
  const atMax = value !== null && value >= max;

  return (
    <div className={cx("ui-stepper", disabled && "is-disabled", className)}>
      <label className="ui-stepper__label" htmlFor={id}>
        {label}
        {unit && <span className="sr-only"> ({unit})</span>}
      </label>
      <div className="ui-stepper__row">
        <button
          type="button"
          className="ui-stepper__key"
          aria-label={`Decrease ${label.toLowerCase()} by ${step}`}
          disabled={disabled || atMin}
          onPointerDown={start(-1)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onKeyDown={onKeyStep(-1)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <IconMinus size={26} />
        </button>
        <div className="ui-stepper__field">
          <input
            id={id}
            className="ui-stepper__input num"
            type="text"
            inputMode={inputMode}
            enterKeyHint="done"
            autoComplete="off"
            pattern={inputMode === "numeric" ? "[0-9]*" : undefined}
            value={draft}
            placeholder={placeholder}
            disabled={disabled}
            aria-describedby={hint ? hintId : undefined}
            onFocus={(e) => {
              editing.current = true;
              justFocused.current = true;
              e.currentTarget.select();
            }}
            onMouseUp={(e) => {
              // The mouseup that follows a click-to-focus collapses the selection in Chrome, so typing
              // appended to the old value ("135" → "135225"). Keep the select-all from focus.
              if (justFocused.current) e.preventDefault();
              justFocused.current = false;
            }}
            onChange={(e) => setDraft(e.currentTarget.value.replace(/[^0-9.,]/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                editing.current = false;
                bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey ? 10 : 1);
              }
            }}
          />
          {unit && (
            <span className="ui-stepper__unit" aria-hidden="true">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          className="ui-stepper__key"
          aria-label={`Increase ${label.toLowerCase()} by ${step}`}
          disabled={disabled || atMax}
          onPointerDown={start(1)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onKeyDown={onKeyStep(1)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <IconPlus size={26} />
        </button>
      </div>
      {hint && (
        <p id={hintId} className="ui-stepper__hint">
          {hint}
        </p>
      )}
    </div>
  );
}
