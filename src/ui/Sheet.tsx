import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { IconClose } from "./icons";
import { IconButton } from "./Button";

export type SheetProps = {
  open: boolean;
  /** Called when the user asks to close: Escape, scrim tap, close button, or drag/flick down. */
  onClose: () => void;
  title: string;
  /** Optional line under the title. */
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer for the sheet's primary action (thumb zone). */
  footer?: ReactNode;
  className?: string;
};

const EXIT_MS = 200;

/**
 * showModal() focuses the close button while the panel is still parked below the screen, and the
 * browser scrolls the dialog to bring it into view. CSS `overflow: clip` stops that where it is
 * supported; this undoes it everywhere else, so the sheet slides in from the right place.
 */
export function showSheetModal(dialog: HTMLDialogElement): void {
  dialog.showModal();
  dialog.scrollTop = 0;
  dialog.scrollLeft = 0;
}
type ViewportLike = Pick<VisualViewport, "offsetLeft" | "offsetTop" | "width" | "height">;
type ViewportSource = ViewportLike & Pick<VisualViewport, "addEventListener" | "removeEventListener">;
type StyleTarget = { style: Pick<CSSStyleDeclaration, "setProperty" | "removeProperty"> };
const VV_VARS = ["--vv-x", "--vv-y", "--vv-w", "--vv-h"] as const;

/**
 * Keep the sheet in the part of the screen the user can see. The dialog is sized to the layout
 * viewport, which is not the screen when the on-screen keyboard is up (Android Chrome shrinks only
 * the visual viewport; iOS Safari pans it) or when something on the page overflows sideways
 * (Android then widens the layout viewport to fit, and a focused field pans the view across it).
 * Publishes the visual viewport's rect as CSS variables that ui.css places the panel with.
 */
export function followVisualViewport(target: StyleTarget, vv: ViewportSource | null | undefined): () => void {
  if (!vv) return () => {};
  const apply = () => {
    const { offsetLeft, offsetTop, width, height } = vv;
    target.style.setProperty("--vv-x", `${offsetLeft}px`);
    target.style.setProperty("--vv-y", `${offsetTop}px`);
    target.style.setProperty("--vv-w", `${width}px`);
    target.style.setProperty("--vv-h", `${height}px`);
  };
  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
    for (const name of VV_VARS) target.style.removeProperty(name);
  };
}

const FLICK_VELOCITY = 0.11; // px per ms
const DISMISS_FRACTION = 0.3;

/**
 * Bottom sheet built on a modal <dialog>: the page behind is inert, focus stays inside,
 * Escape closes, and focus returns to the opener. Drag the handle or header down (or flick)
 * to dismiss; dragging up meets friction instead of a wall.
 */
export function Sheet({ open, onClose, title, description, children, footer, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const descId = useId();
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");

  // Open / close the native dialog in step with `open`, animating both ways.
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      showSheetModal(dialog);
      setState("closed");
      // Next frame so the transition runs from the closed position.
      const raf = requestAnimationFrame(() => setState("open"));
      return () => cancelAnimationFrame(raf);
    }
    if (open && dialog.open) {
      setState("open"); // reopened mid-exit
      return undefined;
    }
    if (!open && dialog.open) {
      setState("closing");
      const t = window.setTimeout(() => {
        dialog.close();
        setState("closed");
        const el = opener.current;
        if (el instanceof HTMLElement && el.isConnected) el.focus();
      }, EXIT_MS);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  // Track the visible screen (keyboard, sideways overflow) while the sheet is up, exit included.
  const shown = open || state !== "closed";
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!shown || !dialog) return undefined;
    return followVisualViewport(dialog, window.visualViewport);
  }, [shown]);

  // Escape: let React own the close so the exit animates.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  // Drag to dismiss.
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);

  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current || (e.pointerType === "mouse" && e.button !== 0)) return; // ignore extra touches
    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    drag.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y;
    setDy(raw >= 0 ? raw : -Math.sqrt(-raw) * 2); // friction upward
  };
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const dist = e.clientY - d.y;
    const velocity = dist / Math.max(1, performance.now() - d.t);
    const h = panelRef.current?.offsetHeight ?? 400;
    setDy(0);
    if (dist > 0 && (dist > h * DISMISS_FRACTION || velocity > FLICK_VELOCITY)) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={cx("ui-sheet", className)}
      data-state={state}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // scrim tap
      }}
    >
      <div
        ref={panelRef}
        className="ui-sheet__panel"
        data-dragging={dy !== 0 || undefined}
        style={dy !== 0 ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div
          className="ui-sheet__grip"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="ui-sheet__handle" aria-hidden="true" />
          <div className="ui-sheet__head">
            <div className="ui-sheet__titles">
              <h2 id={titleId} className="ui-sheet__title">
                {title}
              </h2>
              {description && (
                <p id={descId} className="ui-sheet__desc">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close" icon={<IconClose />} onClick={onClose} />
          </div>
        </div>
        <div className="ui-sheet__body">{children}</div>
        {footer && <div className="ui-sheet__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
