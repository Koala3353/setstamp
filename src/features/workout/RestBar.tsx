// Docked rest bar. Counting down: −15 / +15 / sound / skip. At zero it does not vanish: it turns
// into "Rest over +0:12" (counting up) with Dismiss, until the next rest starts, it is dismissed,
// or five minutes pass. State lives in restTimer.ts, so it survives navigation and reloads.
import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { useNow, formatDuration } from "../../app/useNow";
import { Button, IconTimer } from "../../ui";
import { rest, restPhase, setSoundEnabled, useRest, useRestSound } from "./restTimer";
import { dismissPushOffer, enablePush, installRestRemote, useRestPush, type EnableResult } from "./restPush";
import "./restBar.css";

export function RestBar() {
  const client = useConvex();
  useEffect(() => installRestRemote(client), [client]);
  const r = useRest();
  const sound = useRestSound();
  const now = useNow(250);
  const phase = restPhase(r, now);
  if (!r || !phase) return null;

  if (phase === "over") {
    const since = Math.floor((now - r.endsAt) / 1000);
    return (
      <>
        <div className="wk-rest wk-rest--over">
          <span className="wk-rest__plate" aria-hidden="true">
            <IconTimer size={22} />
          </span>
          <span className="wk-rest__over">
            <span className="wk-rest__title" role="alert">
              Rest over
            </span>
            <span className="wk-rest__since num" aria-hidden="true">
              +{formatDuration(since)}
            </span>
          </span>
          <span className="wk-rest__label">{r.label}</span>
          <button type="button" className="wk-rest__btn wk-rest__btn--skip" onClick={() => rest.dismiss()}>
            Dismiss
          </button>
        </div>
        <PushOffer />
      </>
    );
  }

  const left = Math.max(0, Math.ceil((r.endsAt - now) / 1000));
  const pct = Math.min(100, Math.max(0, (left / r.totalSec) * 100));
  return (
    <>
      <div className="wk-rest" role="timer" aria-label={`Rest ${formatDuration(left)} left`}>
        <div className="wk-rest__track" aria-hidden="true">
          <span style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <IconTimer size={22} className="wk-rest__icon" />
        <span className="wk-rest__time num">{formatDuration(left)}</span>
        <span className="wk-rest__label">{r.label}</span>
        <button type="button" className="wk-rest__btn" onClick={() => rest.adjust(-15)} aria-label="15 seconds less">
          −15
        </button>
        <button type="button" className="wk-rest__btn" onClick={() => rest.adjust(15)} aria-label="15 seconds more">
          +15
        </button>
        <button type="button" className="wk-rest__btn" aria-pressed={sound} onClick={() => setSoundEnabled(!sound)} aria-label="Sound at end of rest">
          {sound ? "Sound" : "Mute"}
        </button>
        <button type="button" className="wk-rest__btn wk-rest__btn--skip" onClick={() => rest.skip()}>
          Skip
        </button>
      </div>
      <PushOffer />
    </>
  );
}

const RESULT_COPY: Partial<Record<EnableResult, string>> = {
  denied: "Notifications are blocked for Setstamp. You can allow them in your browser's site settings, then turn alerts on in Settings.",
  unavailable: "Couldn't set up alerts on this device yet. Try again from Settings.",
  error: "Couldn't turn on alerts. Check your connection and try again from Settings.",
};

/** One-time offer to turn on alerts for when the app is closed. Never asks for permission by itself. */
function PushOffer() {
  const client = useConvex();
  const push = useRestPush();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (message) {
    return (
      <div className="wk-restoffer" role="status">
        <p className="wk-restoffer__text">{message}</p>
        <div className="wk-restoffer__actions">
          <Button variant="ghost" onClick={() => setMessage(null)}>
            OK
          </Button>
        </div>
      </div>
    );
  }
  if (push.offerDismissed || push.on || !push.available || !push.publicKey) return null;
  if (push.support === "unsupported" || push.permission === "denied") return null;

  if (push.support === "ios-needs-install") {
    return (
      <div className="wk-restoffer">
        <p className="wk-restoffer__text">Add Setstamp to your Home Screen to get alerts when the app is closed.</p>
        <div className="wk-restoffer__actions">
          <Button variant="ghost" onClick={dismissPushOffer}>
            OK
          </Button>
        </div>
      </div>
    );
  }

  const key = push.publicKey;
  return (
    <div className="wk-restoffer">
      <p className="wk-restoffer__text">Get an alert when rest is over, even with the app closed or the phone locked.</p>
      <div className="wk-restoffer__actions">
        <Button variant="ghost" onClick={dismissPushOffer}>
          Not now
        </Button>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void enablePush(client, key).then((res) => {
              setBusy(false);
              if (res === "dismissed") return; // closed the prompt: the offer stays for next time
              dismissPushOffer();
              const copy = RESULT_COPY[res];
              if (copy) setMessage(copy);
            });
          }}
        >
          Turn on
        </Button>
      </div>
    </div>
  );
}
