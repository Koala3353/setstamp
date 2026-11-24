// Invitation to add the app to the home screen. Shown once per page load, on the Today screen,
// in a browser tab, after the first screen settles; never over a workout. "Not now" (or closing
// the sheet) snoozes 7 days; "Don't ask again" is permanent. `held` (the first-run tour is
// running or deciding whether to start) delays it; the timer restarts once the hold lifts.
import { useEffect, useState } from "react";
import { Button, Sheet } from "../../ui";
import { installedEarlier, isAndroid, isIOS, isStandalone, promptInstall, useInstallState } from "../settings/install";
import { SHOW_DELAY_MS, detectPlatform, neverAgain, parseMemory, shouldOfferInstall, snoozed, type InstallPlatform, type PromptMemory } from "./policy";
import "./install.css";

const MEMORY_KEY = "gym.installPrompt";
let shownThisSession = false;

function readMemory(): PromptMemory {
  try {
    return parseMemory(localStorage.getItem(MEMORY_KEY));
  } catch {
    return parseMemory(null);
  }
}

function writeMemory(m: PromptMemory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    // Storage blocked: the invitation can come back next load. Acceptable.
  }
}

/** Controller: decides whether to open. Mount it where the Today screen renders. */
export function InstallPrompt({ onToday, workoutActive, held = false }: { onToday: boolean; workoutActive: boolean; held?: boolean }) {
  const { canPrompt, installed } = useInstallState();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!onToday || workoutActive || held) return;
    const t = window.setTimeout(() => {
      const ok = shouldOfferInstall({
        standalone: isStandalone(),
        installed: installed || installedEarlier(),
        memory: readMemory(),
        now: Date.now(),
        onToday,
        workoutActive,
        shownThisSession,
      });
      if (ok) {
        shownThisSession = true;
        setOpen(true);
      }
    }, SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [onToday, workoutActive, installed, held]);

  // Installed from the browser menu while the sheet was up: nothing left to ask.
  useEffect(() => {
    if (installed && open) setOpen(false);
  }, [installed, open]);

  const platform = detectPlatform({ canPrompt, ios: isIOS() });
  return (
    <InstallSheet
      open={open}
      platform={platform}
      android={isAndroid()}
      onSnooze={() => {
        writeMemory(snoozed(Date.now()));
        setOpen(false);
      }}
      onNever={() => {
        writeMemory(neverAgain());
        setOpen(false);
      }}
      onInstall={async () => {
        const outcome = await promptInstall();
        writeMemory(outcome === "accepted" ? neverAgain() : snoozed(Date.now()));
        setOpen(false);
      }}
    />
  );
}

/** Presentational sheet, one body per platform. */
export function InstallSheet({
  open,
  platform,
  android,
  onSnooze,
  onNever,
  onInstall,
}: {
  open: boolean;
  platform: InstallPlatform;
  android: boolean;
  onSnooze: () => void;
  onNever: () => void;
  onInstall: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const footer = (
    <div className="inst-footer">
      {platform === "prompt" ? (
        <Button
          variant="primary"
          size="lg"
          block
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onInstall();
            } finally {
              setBusy(false);
            }
          }}
        >
          Install app
        </Button>
      ) : (
        <Button variant="secondary" size="lg" block onClick={onSnooze}>
          Got it
        </Button>
      )}
      <div className="inst-footer__row">
        {platform === "prompt" && (
          <Button variant="ghost" onClick={onSnooze}>
            Not now
          </Button>
        )}
        <Button variant="ghost" onClick={onNever}>
          Don't ask again
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onSnooze}
      title="Add Setstamp to your home screen"
      description="It opens full screen from its own icon and works offline."
      footer={footer}
      className="inst-sheet"
    >
      {platform === "prompt" && (
        <ul className="inst-points">
          <li>Open it from your home screen with one tap.</li>
          <li>It runs full screen, without the browser's address bar.</li>
          <li>You stay signed in, and there's no app store download.</li>
        </ul>
      )}
      {platform === "ios" && (
        <ol className="inst-steps">
          <li>
            <span className="inst-steps__n num" aria-hidden="true">1</span>
            <span>
              Tap <span className="inst-glyph"><IosShareIcon /> <span>Share</span></span> in Safari's toolbar.
            </span>
          </li>
          <li>
            <span className="inst-steps__n num" aria-hidden="true">2</span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
            </span>
          </li>
          <li>
            <span className="inst-steps__n num" aria-hidden="true">3</span>
            <span>
              Open Setstamp from your home screen. <strong>You'll sign in once in the app</strong>: on iPhone and iPad, home-screen apps keep their own sign-in, separate from Safari.
            </span>
          </li>
        </ol>
      )}
      {platform === "manual" && (
        <ol className="inst-steps">
          <li>
            <span className="inst-steps__n num" aria-hidden="true">1</span>
            <span>
              Open your browser's menu
              {android ? (
                <>
                  : the <span className="inst-glyph inst-glyph--icon"><IconKebab /><span className="sr-only">three dots</span></span> in the top corner
                </>
              ) : null}
              .
            </span>
          </li>
          <li>
            <span className="inst-steps__n num" aria-hidden="true">2</span>
            <span>
              Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. If neither is there, this browser can't install web apps; the app still works here.
            </span>
          </li>
        </ol>
      )}
    </Sheet>
  );
}

/** The iOS Share glyph: a box with an arrow rising out of it. */
export function IosShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2" />
    </svg>
  );
}

function IconKebab() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}
