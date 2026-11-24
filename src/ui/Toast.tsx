import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";
import { IconUndo } from "./icons";

export type ToastOptions = {
  message: string;
  /** e.g. { label: "Undo", onAction: restoreSet }. Undo gets the undo icon automatically. */
  action?: { label: string; onAction: () => void };
  /** ms; default 5000 (6000 with an action). */
  duration?: number;
  tone?: "neutral" | "error";
};

type ToastItem = ToastOptions & { id: number };

type ToastApi = {
  /** Show a toast; replaces the current one. Returns a function that dismisses it. */
  show: (opts: ToastOptions) => () => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/**
 * One toast at a time, bottom of the screen above the tab bar (and the active-workout bar).
 * Announced politely; errors assertively. Pauses its timer while touched or focused.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const seq = useRef(0);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const dismiss = useCallback(() => {
    clear();
    setLeaving(true);
    window.setTimeout(() => {
      setItem(null);
      setLeaving(false);
    }, 160);
  }, []);

  const arm = useCallback(
    (ms: number) => {
      clear();
      timer.current = window.setTimeout(dismiss, ms);
    },
    [dismiss],
  );

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = ++seq.current;
      setLeaving(false);
      setItem({ ...opts, id });
      arm(opts.duration ?? (opts.action ? 6000 : 5000));
      return () => {
        if (seq.current === id) dismiss();
      };
    },
    [arm, dismiss],
  );

  useEffect(() => clear, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const resume = () => item && arm(2500);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toast-region" aria-live={item?.tone === "error" ? "assertive" : "polite"} aria-atomic="true">
        {item && (
          <div
            key={item.id}
            className={cx("ui-toast", item.tone === "error" && "ui-toast--error", leaving && "is-leaving")}
            role={item.tone === "error" ? "alert" : "status"}
            onPointerEnter={clear}
            onPointerLeave={resume}
            onFocus={clear}
            onBlur={resume}
          >
            <span className="ui-toast__msg">{item.message}</span>
            {item.action && (
              <button
                type="button"
                className="ui-toast__action"
                onClick={() => {
                  item.action?.onAction();
                  dismiss();
                }}
              >
                {/undo/i.test(item.action.label) && <IconUndo size={18} />}
                {item.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
