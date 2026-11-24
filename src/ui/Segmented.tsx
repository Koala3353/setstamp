import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; disabled?: boolean };

function useArrowKeys<T extends string>(options: SegmentOption<T>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
    const cur = enabled.findIndex(({ o }) => o.value === value);
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (cur + 1) % enabled.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (cur - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onChange(target.o.value);
    refs.current[target.i]?.focus();
  };
  return { refs, onKeyDown };
}

/** Single choice among 2–4 options (units, theme, view). role="radiogroup". */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const { refs, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} className={cx("ui-seg", className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={cx("ui-seg__opt", on && "is-on")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tabs that switch a panel in place (History | Records). role="tablist".
 * Render the panel yourself with <TabPanel id={tabPanelId(idBase, value)} labelledBy={tabId(idBase, value)}>.
 */
export function Tabs<T extends string>({
  label,
  idBase,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  idBase: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const { refs, onKeyDown } = useArrowKeys(options, value, onChange);
  return (
    <div role="tablist" aria-label={label} className={cx("ui-seg", className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(idBase, o.value)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={tabPanelId(idBase, o.value)}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            className={cx("ui-seg__opt", on && "is-on")}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const tabId = (base: string, v: string) => `${base}-tab-${v}`;
export const tabPanelId = (base: string, v: string) => `${base}-panel-${v}`;

export function TabPanel({ id, labelledBy, children }: { id: string; labelledBy: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={0} className="ui-tabpanel">
      {children}
    </div>
  );
}
