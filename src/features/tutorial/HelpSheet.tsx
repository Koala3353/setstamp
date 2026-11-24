// Short tips for the screen you're on, plus a way to replay the tour.
import type { RouteName } from "../../app/router";
import { Button, Sheet } from "../../ui";
import { SCREEN_TIPS } from "./steps";

export function HelpSheet({ open, route, onClose, onReplay }: { open: boolean; route: RouteName | "notFound"; onClose: () => void; onReplay: () => void }) {
  const tips = route === "notFound" ? undefined : SCREEN_TIPS[route];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tips ? `Tips: ${tips.title}` : "Tips"}
      footer={
        <Button variant="secondary" size="lg" block onClick={onReplay}>
          Replay tutorial
        </Button>
      }
    >
      {tips ? (
        <ul className="help-tips">
          {tips.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">No tips for this screen. The tutorial walks through logging a workout from start to finish.</p>
      )}
    </Sheet>
  );
}

/** A question mark in a circle, drawn like the icons in src/ui/icons.tsx. */
export function IconHelp({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.2-2.5 3.8" />
      <path d="M12 16.6v.4" />
    </svg>
  );
}
