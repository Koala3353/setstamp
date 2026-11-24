// Docked rest countdown: −15 / +15 / skip. State lives in restTimer.ts, so it survives navigation and reloads.
import { useNow, formatDuration } from "../../app/useNow";
import { IconTimer } from "../../ui";
import { rest, setSoundEnabled, useRest, useRestSound } from "./restTimer";

export function RestBar() {
  const r = useRest();
  const sound = useRestSound();
  const now = useNow(250);
  if (!r) return null;
  const left = Math.max(0, Math.ceil((r.endsAt - now) / 1000));
  const pct = Math.min(100, Math.max(0, (left / r.totalSec) * 100));
  return (
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
  );
}
