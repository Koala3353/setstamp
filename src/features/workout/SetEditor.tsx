// Bottom sheet for one set: big steppers, plate math for bar lifts, and "Log set" in the thumb zone.
import { useState } from "react";
import { formatDuration, useNow } from "../../app/useNow";
import { canLog, TRACKING_FIELDS, isLoaded } from "../../logic/tracking";
import { toKg, type Unit } from "../../shared/domain";
import type { SetData, SettingsData } from "../../shared/sync";
import { Button, Segmented, Sheet, Stepper } from "../../ui";
import { platesPerSide } from "../../logic/plates";
import { displayWeight, fmtNum, fromEntered, kgToDisplay, roundTo, smallestIncrement } from "../../logic/units";
import { isBarbell, type ExInfo } from "./exerciseInfo";

type Draft = { kind: SetData["kind"]; weight: number | null; reps: number | null; assist: number | null; duration: number | null; distance: number | null };

function toDraft(s: SetData, unit: Unit): Draft {
  return { kind: s.kind, weight: displayWeight(s, unit), reps: s.reps, assist: kgToDisplay(s.assistKg, unit), duration: s.durationSec, distance: s.distanceM };
}

export function applyDraft(s: SetData, d: Draft, unit: Unit): SetData {
  const sameWeight = displayWeight(s, unit) === d.weight;
  return {
    ...s,
    kind: d.kind,
    ...(sameWeight ? {} : fromEntered(d.weight, unit)),
    reps: d.reps,
    assistKg: d.assist === null ? null : toKg(d.assist, unit),
    durationSec: d.duration,
    distanceM: d.distance,
  };
}

/** A set needs its main numbers before it can be logged, so history never holds "– × –". */
const loggable = (d: Draft, t: ExInfo["tracking"]) =>
  canLog({ weightKg: d.weight, reps: d.reps, assistKg: d.assist, durationSec: d.duration, distanceM: d.distance }, t);

/** Count-up stopwatch for holds: Start, then Stop fills the time. */
function HoldTimer({ onStop }: { onStop: (sec: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  return startedAt === null ? (
    <Button variant="secondary" block onClick={() => setStartedAt(Date.now())}>
      Start timer
    </Button>
  ) : (
    <RunningTimer
      startedAt={startedAt}
      onStop={(sec) => {
        setStartedAt(null);
        onStop(sec);
      }}
    />
  );
}

function RunningTimer({ startedAt, onStop }: { startedAt: number; onStop: (sec: number) => void }) {
  const now = useNow(250);
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <div className="wk-timer" role="timer" aria-live="off">
      <span className="wk-timer__time num">{formatDuration(sec)}</span>
      <Button variant="secondary" onClick={() => onStop(Math.max(1, Math.round((Date.now() - startedAt) / 1000)))}>
        Stop and use
      </Button>
    </div>
  );
}

export function SetEditor({
  open,
  set,
  info,
  settings,
  title,
  onClose,
  onSave,
  onLog,
  onDelete,
}: {
  open: boolean;
  set: SetData | null;
  info: ExInfo;
  settings: SettingsData;
  title: string;
  onClose: () => void;
  onSave: (next: SetData) => void;
  onLog: (next: SetData) => void;
  onDelete: () => void;
}) {
  const unit = settings.unit;
  // Mounted per set (keyed by the caller), so the draft starts from the set once and survives re-renders.
  const [draft, setDraft] = useState<Draft | null>(() => (set ? toDraft(set, unit) : null));

  const d = draft;
  const patch = (p: Partial<Draft>) => setDraft((cur) => (cur ? { ...cur, ...p } : cur));
  const close = () => {
    if (set && d) onSave(applyDraft(set, d, unit));
    onClose();
  };

  const t = info.tracking;
  const f = TRACKING_FIELDS[t];
  const inc = smallestIncrement(info.equipment, unit);
  const bar = isBarbell(info.equipment) && isLoaded(t);
  const plates = bar && d?.weight ? platesPerSide(toKg(d.weight, unit), settings.barKg, settings.platesKg) : null;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      footer={
        set && d ? (
          <div className="sheet-actions">
            <Button variant="danger" onClick={onDelete}>
              Delete set
            </Button>
            <Button
              variant="primary"
              // aria-disabled, not disabled: a number typed but not yet committed (the field commits on
              // blur) must still log on the same tap that blurs it.
              aria-disabled={!loggable(d, t)}
              onClick={() => {
                if (loggable(d, t)) onLog(applyDraft(set, d, unit));
              }}
            >
              {set.done ? "Save" : "Log set"}
            </Button>
          </div>
        ) : null
      }
    >
      {d && (
        <div className="wk-editor">
          <Segmented
            label="Set type"
            value={d.kind === "warmup" ? "warmup" : "working"}
            onChange={(v: string) => patch({ kind: v === "warmup" ? "warmup" : "working" })}
            options={[
              { value: "working", label: "Working" },
              { value: "warmup", label: "Warm-up" },
            ]}
          />
          {(f.load === "weight" || f.load === "added") && (
            <Stepper
              label={f.load === "added" ? "Added weight" : "Weight"}
              value={d.weight}
              onChange={(v) => patch({ weight: v })}
              step={inc}
              max={2000}
              inputMode="decimal"
              unit={unit}
            />
          )}
          {plates && (
            <p className="wk-plates" aria-live="polite">
              {plates.belowBar ? (
                <>Below the empty bar ({fmtNum(kgToDisplay(settings.barKg, unit))} {unit}).</>
              ) : (
                <>
                  Per side:{" "}
                  <strong className="num">{plates.perSide.length ? plates.perSide.map((p) => fmtNum(roundTo(kgToDisplay(p, unit) ?? 0, 0.25))).join(" · ") : "empty bar"}</strong>
                  <span className="muted small"> on a {fmtNum(kgToDisplay(settings.barKg, unit))} {unit} bar</span>
                  {plates.remainderKg > 0.001 && (
                    <span className="wk-plates__rem">
                      {" "}
                      Can't load exactly: {fmtNum(kgToDisplay(plates.loadedKg, unit))} {unit} is closest ({fmtNum(kgToDisplay(plates.remainderKg, unit))} {unit} short).
                    </span>
                  )}
                </>
              )}
            </p>
          )}
          {f.load === "assist" && (
            <Stepper label="Assistance" value={d.assist} onChange={(v) => patch({ assist: v })} step={inc} max={500} inputMode="decimal" unit={unit} hint="Less assistance is harder." />
          )}
          {f.distance && (
            <Stepper
              label="Distance"
              value={d.distance}
              onChange={(v) => patch({ distance: v })}
              step={5}
              max={100000}
              inputMode="decimal"
              unit="m"
              hint={t === "distance_time" ? "Optional." : undefined}
            />
          )}
          {f.time && (
            <>
              <Stepper label="Time" value={d.duration} onChange={(v) => patch({ duration: v })} step={5} max={36000} unit="s" />
              <HoldTimer onStop={(sec) => patch({ duration: sec })} />
            </>
          )}
          {f.reps && <Stepper label="Reps" value={d.reps} onChange={(v) => patch({ reps: v })} step={1} max={999} unit="reps" />}
        </div>
      )}
    </Sheet>
  );
}
