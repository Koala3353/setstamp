// Drag-and-drop reordering, hand-rolled on Pointer Events (no dependency).
//
// The list keeps its DOM order while dragging: the preview order is applied with the CSS `order`
// property (the container must be flex or grid), so nothing is re-parented under the finger and
// focus stays on the handle. Items that change place slide there with a FLIP transform; the lifted
// item follows the pointer. Hit-testing uses the positions measured at pick-up, so a preview never
// feeds back into the next decision.
//
// Only the handle starts a drag (touch-action: none on the handle alone), so the list still
// scrolls on phones. Keyboard: Space/Enter picks up, arrows move, Space/Enter drops, Escape
// cancels; every step is announced in an aria-live region.
import "./sortable.css";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { IconGrip } from "./icons";

export type SortableOptions = {
  /** Current committed order (stable item keys). */
  keys: readonly string[];
  /** Spoken name of an item, for the handle label and announcements. */
  name: (key: string) => string;
  /**
   * Order that results from moving the item at `from` so it ends up at index `to` (array-move
   * semantics), or null when nothing changes. Defaults to a plain array move. Use it for rules
   * such as "supersets move as one block".
   */
  resolve?: (from: number, to: number) => readonly string[] | null;
  /** Called once per drop that changed the order. */
  onCommit: (order: string[]) => void;
};

export type SortHandleBind = {
  ref: (el: HTMLButtonElement | null) => void;
  "aria-label": string;
  "aria-describedby": string;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onBlur: () => void;
  onContextMenu: (e: { preventDefault: () => void }) => void;
};

export type SortItemBind = {
  ref: (el: HTMLElement | null) => void;
  className: string;
  style: CSSProperties;
  "data-sort-key": string;
};

// ───────────────────────────── pure helpers ─────────────────────────────

export function arrayMove<T>(xs: readonly T[], from: number, to: number): T[] {
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, x!);
  return out;
}

/** Index the dragged item should take: how many of the other items' midpoints lie above its centre. */
export function targetIndex(otherMids: readonly number[], center: number): number {
  let n = 0;
  for (const m of otherMids) if (m < center) n++;
  return n;
}

/**
 * Auto-scroll speed in px per frame for a pointer at `y` inside a visible band [top, bottom]
 * (viewport minus the sticky header and the bottom dock). Ramps up over `zone` px at each edge.
 */
export function autoScrollSpeed(y: number, top: number, bottom: number, zone = 64, max = 18): number {
  if (bottom - top < zone * 2) zone = Math.max(8, (bottom - top) / 3);
  if (y < top + zone) return -Math.ceil(max * Math.min(1, (top + zone - y) / zone));
  if (y > bottom - zone) return Math.ceil(max * Math.min(1, (y - (bottom - zone)) / zone));
  return 0;
}

/**
 * Keyboard step: from target `to`, move one slot in `dir` until the resolved order actually
 * changes (block rules can make some targets no-ops). Null at the ends.
 */
export function keyboardStep(
  n: number,
  from: number,
  to: number,
  dir: -1 | 1,
  current: readonly string[],
  resolveOrder: (from: number, to: number) => readonly string[],
): { to: number; order: readonly string[] } | null {
  const sig = current.join("\u0000");
  for (let t = to + dir; t >= 0 && t < n; t += dir) {
    const order = resolveOrder(from, t);
    if (order.join("\u0000") !== sig) return { to: t, order };
  }
  return null;
}

export const sortPosition = (order: readonly string[], key: string) => `position ${order.indexOf(key) + 1} of ${order.length}`;

// ───────────────────────────── the hook ─────────────────────────────

type Drag = {
  key: string;
  from: number;
  to: number;
  mode: "pointer" | "keyboard";
  base: readonly string[];
  pointerId: number;
  /** Pointer page Y minus the item's top at pick-up. */
  grab: number;
  height: number;
  /** Midpoints (page Y) of the other items at pick-up, in committed order. */
  mids: number[];
  clientY: number;
};

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const tick = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Not supported (iOS Safari) or blocked: haptics are a nicety.
  }
};
const SETTLE_MS = 240;

/** Top and bottom of the area not covered by the sticky header and the bottom dock. */
function visibleBand(): [number, number] {
  const header = document.querySelector(".shell-header");
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dock-h")) || 0;
  return [top, window.innerHeight - dock];
}

export function useSortable({ keys, name, resolve, onCommit }: SortableOptions) {
  const uid = useId();
  const helpId = `${uid}-help`;
  const [preview, setPreviewState] = useState<readonly string[] | null>(null);
  const shown = useRef<readonly string[] | null>(null);
  const setPreview = (next: readonly string[] | null) => {
    shown.current = next;
    setPreviewState(next);
  };
  // Bumped whenever positions were captured, so the FLIP pass runs even if `order` is unchanged.
  const [flipVersion, setFlipVersion] = useState(0);
  const [pending, setPending] = useState<readonly string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const items = useRef(new Map<string, HTMLElement>());
  const extras = useRef(new Map<string, HTMLElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const itemRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const extraRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const handleRefs = useRef(new Map<string, (el: HTMLButtonElement | null) => void>());
  const drag = useRef<Drag | null>(null);
  const flipFrom = useRef<Map<HTMLElement, number> | null>(null);
  const naturalTop = useRef(0);
  const settleTimer = useRef(0);
  const refocus = useRef<string | null>(null);
  const latest = useRef({ keys, name, resolve, onCommit });
  latest.current = { keys, name, resolve, onCommit };

  const keysSig = keys.join("\u0000");
  const order = preview ?? pending ?? keys;

  const resolveOrder = useCallback((base: readonly string[], from: number, to: number): readonly string[] => {
    const r = latest.current.resolve;
    return (r ? r(from, to) : to === from ? null : arrayMove(base, from, to)) ?? base;
  }, []);

  /** Remember where everything is on screen right now, so the next layout can slide from there. */
  const captureFlip = () => {
    const m = new Map<HTMLElement, number>();
    for (const el of [...items.current.values(), ...extras.current.values()]) m.set(el, el.getBoundingClientRect().top);
    flipFrom.current = m;
    setFlipVersion((v) => v + 1);
  };

  const placeLifted = () => {
    const d = drag.current;
    if (!d || d.mode !== "pointer") return;
    const el = items.current.get(d.key);
    if (!el) return;
    const top = d.clientY + window.scrollY - d.grab;
    el.style.transform = `translate3d(0, ${top - naturalTop.current}px, 0)`;
  };

  // FLIP: after the order changed, slide every element from where it was to where it now sits.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = null;
    const d = drag.current;
    const pointerKey = d?.mode === "pointer" ? d.key : null;
    const reduce = reducedMotion();
    const all = [...items.current.entries(), ...[...extras.current.entries()].map(([k, el]) => [`extra:${k}`, el] as const)];
    for (const [, el] of all) {
      el.style.transition = "none";
      el.style.transform = "";
    }
    const tops = all.map(([, el]) => el.getBoundingClientRect().top);
    const moving: HTMLElement[] = [];
    all.forEach(([key, el], k) => {
      if (key === pointerKey) {
        naturalTop.current = tops[k]! + window.scrollY;
        return;
      }
      const before = from.get(el);
      const dy = before === undefined ? 0 : before - tops[k]!;
      if (!dy || reduce) return;
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
      moving.push(el);
    });
    placeLifted();
    if (!moving.length) return;
    void document.body.offsetHeight; // commit the inverted positions before playing
    for (const el of moving) {
      el.style.transition = "transform var(--dur-base, 220ms) var(--ease-out, ease-out)";
      el.style.transform = "";
    }
    window.setTimeout(() => {
      for (const el of moving) if (!el.style.transform) el.style.transition = "";
    }, SETTLE_MS + 40);
  }, [order, flipVersion]);

  // Committed order arrived from the store: drop the optimistic copy, put focus back if needed.
  useEffect(() => {
    setPending(null);
    if (drag.current) end(false, true);
    const k = refocus.current;
    refocus.current = null;
    if (k) {
      const h = handles.current.get(k);
      if (h && document.activeElement !== h) h.focus({ preventScroll: true });
    }
  }, [keysSig]);
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), 4000); // the write never landed
    return () => window.clearTimeout(t);
  }, [pending]);

  const say = (text: string) => setMessage((m) => (m === text ? `${text} ` : text));

  // ── pointer ──
  const raf = useRef(0);
  const scrollLoop = () => {
    const d = drag.current;
    if (!d || d.mode !== "pointer") return;
    const [top, bottom] = visibleBand();
    const v = autoScrollSpeed(d.clientY, top, bottom);
    if (v) {
      const before = window.scrollY;
      window.scrollBy(0, v);
      if (window.scrollY !== before) move(d.clientY);
    }
    raf.current = requestAnimationFrame(scrollLoop);
  };

  const move = (clientY: number) => {
    const d = drag.current;
    if (!d) return;
    d.clientY = clientY;
    const center = clientY + window.scrollY - d.grab + d.height / 2;
    const to = targetIndex(d.mids, center);
    if (to !== d.to) {
      d.to = to;
      const next = resolveOrder(d.base, d.from, to);
      const cur = shown.current ?? d.base;
      if (next.join("\u0000") !== cur.join("\u0000")) {
        captureFlip();
        setPreview(next);
        tick();
        say(`${latest.current.name(d.key)}, ${sortPosition(next, d.key)}`);
      }
    }
    placeLifted();
  };

  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: (e: PointerEvent) => void; key: (e: globalThis.KeyboardEvent) => void; blur: () => void } | null>(null);
  const detach = () => {
    const l = listeners.current;
    if (!l) return;
    window.removeEventListener("pointermove", l.move);
    window.removeEventListener("pointerup", l.up);
    window.removeEventListener("pointercancel", l.cancel);
    window.removeEventListener("keydown", l.key, true);
    window.removeEventListener("blur", l.blur);
    listeners.current = null;
  };

  /** Finish a drag: commit the preview, or put everything back. `silent` skips animation (list changed under us). */
  function end(commit: boolean, silent = false) {
    const d = drag.current;
    detach();
    cancelAnimationFrame(raf.current);
    document.documentElement.classList.remove("ui-sorting");
    if (!d) return;
    const { keys: now, name: nameOf } = latest.current;
    const finalOrder = commit ? (shown.current ?? d.base) : d.base;
    const changed = finalOrder.join("\u0000") !== now.join("\u0000");
    drag.current = null;
    if (!silent) captureFlip();
    else for (const el of items.current.values()) (el.style.transform = ""), (el.style.transition = "");
    setPreview(null);
    if (commit && changed) {
      setPending(finalOrder);
      latest.current.onCommit([...finalOrder]);
      if (d.mode === "keyboard") refocus.current = d.key;
    }
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setLifted(null), silent ? 0 : SETTLE_MS);
    say(
      commit
        ? `Dropped ${nameOf(d.key)}, ${sortPosition(finalOrder, d.key)}`
        : `Move cancelled. ${nameOf(d.key)} is back at ${sortPosition(d.base, d.key)}`,
    );
  }

  const begin = (key: string, mode: Drag["mode"], pointerId: number, clientY: number) => {
    const base = latest.current.keys;
    const from = base.indexOf(key);
    const el = items.current.get(key);
    if (from < 0 || !el) return false;
    const sy = window.scrollY;
    const mids: number[] = [];
    base.forEach((k, i) => {
      if (i === from) return;
      const r = items.current.get(k)?.getBoundingClientRect();
      if (r) mids.push(r.top + sy + r.height / 2);
    });
    const r = el.getBoundingClientRect();
    naturalTop.current = r.top + sy;
    drag.current = { key, from, to: from, mode, base, pointerId, grab: clientY + sy - naturalTop.current, height: r.height, mids, clientY };
    window.clearTimeout(settleTimer.current);
    setLifted(key);
    setPreview(base);
    tick();
    const pos = sortPosition(base, key);
    say(
      mode === "keyboard"
        ? `Picked up ${latest.current.name(key)}, ${pos}. Use the arrow keys to move, Space to drop, Escape to cancel.`
        : `Picked up ${latest.current.name(key)}, ${pos}.`,
    );
    return true;
  };

  const onPointerDown = (key: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current || (e.pointerType === "mouse" && e.button !== 0) || !e.isPrimary) return;
    const id = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    if (e.pointerType === "mouse") e.preventDefault(); // no text selection; focus stays put
    const l = {
      move: (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
          started = begin(key, "pointer", id, startY);
          if (!started) return detach();
          document.documentElement.classList.add("ui-sorting");
          raf.current = requestAnimationFrame(scrollLoop);
        }
        ev.preventDefault();
        move(ev.clientY);
      },
      up: (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (started) end(true);
        else detach();
      },
      cancel: (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        if (started) end(false);
        else detach();
      },
      key: (ev: globalThis.KeyboardEvent) => {
        if (ev.key === "Escape" && started) {
          ev.preventDefault();
          ev.stopPropagation();
          end(false);
        }
      },
      blur: () => (started ? end(false) : detach()),
    };
    detach();
    listeners.current = l;
    window.addEventListener("pointermove", l.move, { passive: false });
    window.addEventListener("pointerup", l.up);
    window.addEventListener("pointercancel", l.cancel);
    window.addEventListener("keydown", l.key, true);
    window.addEventListener("blur", l.blur);
  };

  // ── keyboard ──
  const onKeyDown = (key: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const pick = e.key === " " || e.key === "Enter";
    if (!d) {
      if (!pick) return;
      e.preventDefault();
      begin(key, "keyboard", -1, 0);
      return;
    }
    if (d.mode !== "keyboard" || d.key !== key) return;
    if (pick) {
      e.preventDefault();
      end(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      end(false);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const dir = e.key === "ArrowUp" ? -1 : 1;
      const cur = shown.current ?? d.base;
      const step = keyboardStep(d.base.length, d.from, d.to, dir, cur, (f, t) => resolveOrder(d.base, f, t));
      const nameOf = latest.current.name(key);
      if (!step) {
        say(`${nameOf} is already ${dir < 0 ? "first" : "last"}, ${sortPosition(cur, key)}`);
        return;
      }
      d.to = step.to;
      captureFlip();
      setPreview(step.order);
      tick();
      say(`${nameOf}, ${sortPosition(step.order, key)}`);
      requestAnimationFrame(() => items.current.get(key)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }));
    } else if (e.key === "Tab") {
      end(false);
    }
  };

  useEffect(
    () => () => {
      detach();
      cancelAnimationFrame(raf.current);
      window.clearTimeout(settleTimer.current);
      document.documentElement.classList.remove("ui-sorting");
    },
    [],
  );

  // ── bindings ──
  const cached = <E,>(cache: Map<string, (el: E | null) => void>, store: Map<string, E>, key: string) => {
    let fn = cache.get(key);
    if (!fn) {
      fn = (el: E | null) => {
        if (el) store.set(key, el);
        else store.delete(key);
      };
      cache.set(key, fn);
    }
    return fn;
  };

  const active = drag.current?.key ?? null;
  const rank = (key: string) => order.indexOf(key);

  return {
    /** Order to show: the drag preview, else the just-dropped order, else `keys`. */
    order,
    /** Key being dragged (or settling after a drop), for styling. */
    lifted,
    dragging: active !== null || preview !== null,
    /** Class for the list container (flex or grid). */
    listClass: (className?: string) => cx("ui-sortable", (preview !== null || pending !== null || lifted !== null) && "is-sorting", className),
    /** Visual position of an item in `order`; apply as CSS `order` when you can't re-render. */
    rank,
    /** Spread on the element that moves (an <li>, a card wrapper). Its parent must be flex or grid. */
    item: (key: string, className?: string): SortItemBind => ({
      ref: cached(itemRefs.current, items.current, key),
      className: cx("ui-sort-item", lifted === key && "is-lifted", className),
      style: { order: rank(key) },
      "data-sort-key": key,
    }),
    /** Something else that moves with the list (a group header): it slides with FLIP too. */
    extra: (id: string) => cached(extraRefs.current, extras.current, id),
    /** Spread on <SortHandle>. */
    handle: (key: string): SortHandleBind => ({
      ref: cached(handleRefs.current, handles.current, key),
      "aria-label": `Reorder ${latest.current.name(key)}`,
      "aria-describedby": helpId,
      onPointerDown: onPointerDown(key),
      onKeyDown: onKeyDown(key),
      onBlur: () => {
        const d = drag.current;
        if (d && d.mode === "keyboard" && d.key === key) end(false);
      },
      onContextMenu: (e) => e.preventDefault(),
    }),
    /** Render once near the list: the instructions and the live announcements. */
    live: (
      <>
        <span id={helpId} className="sr-only">
          Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.
        </span>
        <span className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
          {message}
        </span>
      </>
    ) as ReactNode,
  };
}

export type Sortable = ReturnType<typeof useSortable>;

/** The grip button that starts a drag. 44px touch target; only it blocks touch scrolling. */
export function SortHandle({ bind, className }: { bind: SortHandleBind; className?: string }) {
  return (
    <button type="button" className={cx("ui-sort-handle", className)} {...bind}>
      <IconGrip size={22} />
    </button>
  );
}
