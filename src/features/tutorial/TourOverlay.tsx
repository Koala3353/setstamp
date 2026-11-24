// The spotlight: dims the page around the step's target, keeps a card beside it, and gets out of
// the way of bottom sheets (which sit in the browser's top layer and make the page inert).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { navigate } from "../../app/router";
import { Button } from "../../ui";
import { canGoNext, STEP_IDS, stepIndex, type Snapshot, type TourState } from "./machine";
import { placeCard, sameBox, spotlightRect, type Box } from "./position";
import { stepCopy } from "./steps";
import { WelcomeChoices, useWelcomeChoices } from "./Welcome";
import "./tutorial.css";

/** Show the step as a centered card if its target hasn't appeared by then. */
const TARGET_TIMEOUT_MS = 2000;
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** True while any modal sheet is open. */
function useSheetOpen(): boolean {
  const [open, setOpen] = useState(() => document.querySelector("dialog[open]") !== null);
  useEffect(() => {
    const check = () => setOpen(document.querySelector("dialog[open]") !== null);
    const mo = new MutationObserver(check);
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    check();
    return () => mo.disconnect();
  }, []);
  return open;
}

type Found = { el: Element | null; rect: Box | null; timedOut: boolean };

/** Finds the target and follows it every frame (scroll, resize, layout shifts). */
function useTarget(target: string | string[] | undefined, onRoute: boolean, stepKey: string): Found {
  const selector = Array.isArray(target) ? target.join("\n") : target;
  const [found, setFound] = useState<Found>({
    el: null,
    rect: null,
    timedOut: false,
  });
  useEffect(() => {
    setFound({ el: null, rect: null, timedOut: false });
    if (!selector || !onRoute) return;
    const started = performance.now();
    let raf = 0;
    let scrolledFor: Element | null = null;
    let last: Found = { el: null, rect: null, timedOut: false };
    const tick = () => {
      let el: Element | null = null;
      for (const sel of selector.split("\n")) if ((el = document.querySelector(sel))) break;
      const r = el?.getBoundingClientRect();
      const rect = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      if (el && rect && scrolledFor !== el) {
        scrolledFor = el;
        const vh = window.innerHeight;
        // Docked controls never scroll; anything else is brought clear of the header and dock.
        const docked = el.closest(".shell-dock, .screen-action") !== null;
        if (!docked && (rect.top < 64 || rect.top + rect.height > vh - 160))
          el.scrollIntoView({
            block: "center",
            behavior: reducedMotion() ? "auto" : "smooth",
          });
      }
      const timedOut = !rect && performance.now() - started > TARGET_TIMEOUT_MS;
      if (el !== last.el || !sameBox(rect, last.rect) || timedOut !== last.timedOut) {
        last = { el: rect ? el : null, rect, timedOut };
        setFound(last);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selector, onRoute, stepKey]);
  return found;
}

export function TourOverlay({
  tour,
  snap,
  onNext,
  onSkip,
  onDiscardPractice,
}: {
  tour: TourState;
  snap: Snapshot;
  onNext: () => void;
  onSkip: () => void;
  onDiscardPractice: () => Promise<void>;
}) {
  const step = tour.step;
  const copy = stepCopy(step, snap);
  const onRoute = !copy.routes || (snap.route !== "notFound" && copy.routes.includes(snap.route));
  const target = useTarget(copy.target, onRoute, step);
  const sheetOpen = useSheetOpen();
  const welcome = useWelcomeChoices();
  const [busy, setBusy] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(200);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCardH(el.offsetHeight));
    ro.observe(el);
    setCardH(el.offsetHeight);
    return () => ro.disconnect();
  });

  // Each new step: focus the card so keyboard and screen-reader users start there.
  useEffect(() => {
    if (sheetOpen) return;
    const id = requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [step, sheetOpen]);

  // Esc skips (unless a sheet is open: Esc closes the sheet). Tab cycles card ↔ target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
        return;
      }
      if (e.key !== "Tab") return;
      const card = cardRef.current;
      if (!card) return;
      const active = document.activeElement;
      const t = target.el instanceof HTMLElement ? target.el : null;
      const inCard = active !== null && card.contains(active);
      const inTarget = t !== null && active !== null && t.contains(active);
      if (!inCard && !inTarget && active !== card) return;
      const targetStops = t ? [...(t.matches(FOCUSABLE) ? [t] : []), ...t.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
      const stops = [...card.querySelectorAll<HTMLElement>(FOCUSABLE), ...targetStops];
      if (!stops.length) return;
      const i = stops.indexOf(active as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? stops.length - 1 : i - 1) : i === -1 || i === stops.length - 1 ? 0 : i + 1;
      e.preventDefault();
      stops[next]!.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip, target.el]);

  // Over a sheet, the page (and this overlay) is inert and covered: show a one-line hint in the
  // top layer instead, if the step has one.
  const showHint = sheetOpen && !!copy.sheetHint;
  useEffect(() => {
    const el = hintRef.current as
      | (HTMLDivElement & {
          showPopover?: () => void;
          hidePopover?: () => void;
        })
      | null;
    if (!el?.showPopover) return;
    try {
      if (showHint) {
        // Re-show so it lands above the sheet that just opened.
        if (el.matches(":popover-open")) el.hidePopover?.();
        el.showPopover();
      } else if (el.matches(":popover-open")) el.hidePopover?.();
    } catch {
      /* popover unsupported: the card's own text already said what to do */
    }
  }, [showHint, copy.sheetHint]);

  const centeredStep = !copy.target;
  const waiting = !centeredStep && onRoute && !target.rect && !target.timedOut;
  const spot = target.rect ? spotlightRect(target.rect, viewport) : null;
  const place = placeCard({
    target: spot,
    card: { width: 360, height: cardH },
    viewport,
  });
  const blocking = step === "welcome" || step === "done";
  const goTo = !target.rect && copy.goTo && (!onRoute || target.timedOut) ? copy.goTo : null;
  const total = STEP_IDS.length - 2; // welcome and done aren't counted
  const n = stepIndex(step);
  const showNext = canGoNext(step, snap) || (!centeredStep && target.timedOut && onRoute);

  const primary = (() => {
    if (step === "welcome")
      return (
        <Button
          variant="primary"
          loading={busy}
          disabled={!welcome.ready}
          onClick={async () => {
            setBusy(true);
            try {
              await welcome.apply();
            } finally {
              setBusy(false);
            }
            onNext();
          }}
        >
          Start tour
        </Button>
      );
    if (step === "done")
      return (
        <Button variant="primary" onClick={onNext}>
          Done
        </Button>
      );
    if (step === "wrap" && tour.practiceCid && snap.openSessionCid === tour.practiceCid)
      return (
        <>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDiscardPractice();
              } finally {
                setBusy(false);
              }
            }}
          >
            Discard practice workout
          </Button>
          <Button variant="ghost" onClick={onNext}>
            Keep it
          </Button>
        </>
      );
    if (goTo)
      return (
        <Button variant="secondary" onClick={() => navigate(goTo.path)}>
          {goTo.label}
        </Button>
      );
    if (showNext)
      return (
        <Button variant="secondary" onClick={onNext}>
          Next
        </Button>
      );
    return null;
  })();

  const body: ReactNode =
    step === "wrap" && !(tour.practiceCid && snap.openSessionCid === tour.practiceCid)
      ? "Finish workout saves it to your history. Discard workout deletes it. Both are at the bottom of the workout screen."
      : copy.body;

  const hidden = sheetOpen || waiting;

  return createPortal(
    <>
      <p className="sr-only" aria-live="polite">
        {hidden ? "" : `${copy.title}. ${typeof body === "string" ? body : ""}`}
      </p>
      <div className={`tour${hidden ? " is-hidden" : ""}${blocking ? " is-blocking" : ""}`} data-step={step}>
        {spot ? (
          <div
            className="tour__hole"
            style={{
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
            }}
            aria-hidden="true"
          />
        ) : (
          <div className="tour__scrim" aria-hidden="true" />
        )}
        <div
          key={step}
          ref={cardRef}
          className={`tour__card tour__card--${place.placement}`}
          style={{ top: place.top, left: place.left, width: place.width }}
          role="dialog"
          aria-modal={blocking ? "true" : "false"}
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          tabIndex={-1}
        >
          {step !== "done" && (
            <div className="tour__head">
              {n > 0 && n <= total && (
                <span className="tour__count">
                  <span className="num">{n}</span> of <span className="num">{total}</span>
                </span>
              )}
              <button type="button" className="tour__skip" onClick={onSkip}>
                {step === "welcome" ? "Skip tour" : "Skip"}
              </button>
            </div>
          )}
          <h2 id="tour-title" className="tour__title">
            {copy.title}
          </h2>
          <p id="tour-body" className="tour__body">
            {body}
          </p>
          {step === "welcome" && <WelcomeChoices state={welcome} />}
          {primary && <div className="tour__actions">{primary}</div>}
        </div>
      </div>
      <div ref={hintRef} popover="manual" className={`tour-hint tour-hint--${copy.sheetHintAt ?? "top"}`} role="status">
        {copy.sheetHint}
      </div>
    </>,
    document.body,
  );
}
