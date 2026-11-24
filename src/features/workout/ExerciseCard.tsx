// One exercise in the session: last time, target, set rows with a one-tap ✓, and a menu for the rest.
import { useState } from "react";
import { cx } from "../../ui";
import type { PlannedSlot, SetData, SettingsData } from "../../shared/sync";
import { Button, IconButton, IconCheck, IconMore, IconPlus, Sheet, TextField } from "../../ui";
import { formatLast, type PreviousPerformance } from "../../logic/history";
import type { ProgressionHint } from "../../logic/progression";
import { displayWeight, fmtNum, kgToDisplay } from "../../logic/units";
import type { ExInfo } from "./exerciseInfo";

export type SetRow = { cid: string; data: SetData };

export type CardActions = {
  logSet: (row: SetRow) => void;
  /** What ✓ would log for an open set (its own values, else prefilled from the set above / last time). */
  preview: (row: SetRow) => SetData;
  editSet: (row: SetRow) => void;
  addSet: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
  substitute: () => void;
  addWarmups: () => void;
  remove: () => void;
  setNotes: (notes: string) => void;
  setRest: (sec: number | null) => void;
};

function cell(s: SetData, info: ExInfo, settings: SettingsData): { main: string; sub: string } {
  const unit = settings.unit;
  switch (info.tracking) {
    case "duration":
    case "distance_time":
      return { main: s.durationSec !== null ? String(s.durationSec) : "–", sub: "s" };
    case "assisted_reps":
      return { main: s.assistKg === null ? "–" : `−${fmtNum(kgToDisplay(s.assistKg, unit))}`, sub: `${unit} assist` };
    case "bodyweight_reps": {
      const w = displayWeight(s, unit);
      return w ? { main: `+${fmtNum(w)}`, sub: unit } : { main: "BW", sub: "" };
    }
    default:
      return { main: fmtNum(displayWeight(s, unit)), sub: unit };
  }
}

/** Screen-reader wording for a set row: "135 lb, 8 reps" rather than "135×8" or "–×8". */
function spoken(c: { main: string; sub: string }, reps: number | null, timed: boolean): string {
  if (timed) return c.main === "–" ? "no time yet" : `${c.main} seconds`;
  const load = c.main === "–" ? (c.sub.includes("assist") ? "no assistance set" : "no weight yet") : c.main === "BW" ? "bodyweight" : `${c.main} ${c.sub}`;
  return `${load}, ${reps === null ? "no reps" : reps === 1 ? "1 rep" : `${reps} reps`}`;
}

export function ExerciseCard({
  info,
  substitutedFrom,
  notes,
  restSec,
  sets,
  prev,
  slot,
  hint,
  settings,
  nextCid,
  actions,
}: {
  info: ExInfo;
  substitutedFrom: string | null;
  notes: string;
  restSec: number | null;
  sets: SetRow[];
  prev: PreviousPerformance | null;
  slot: PlannedSlot | null;
  hint: ProgressionHint | null;
  settings: SettingsData;
  /** The one set the whole session should log next: its ✓ is the screen's orange action. */
  nextCid: string | null;
  actions: CardActions;
}) {
  const [menu, setMenu] = useState(false);
  const [noteDraft, setNoteDraft] = useState(notes);
  const [showRule, setShowRule] = useState(false);
  // Only a set the lifter just ticked gets the stamp; sets that load already done stay still.
  const [stamped, setStamped] = useState<string | null>(null);
  const working = sets.filter((r) => r.data.kind !== "warmup");
  const workingDone = working.filter((r) => r.data.done).length;
  const complete = working.length > 0 && workingDone === working.length;
  const timed = info.tracking === "duration" || info.tracking === "distance_time";
  let workingNo = 0;
  const last = prev ? formatLast(prev.sets, info.tracking, settings.unit) : "";
  const target = slot
    ? `${slot.sets} × ${slot.durationSec ? `${slot.durationSec}s` : slot.repMin !== null && slot.repMax !== null && slot.repMin !== slot.repMax ? `${slot.repMin}–${slot.repMax}` : (slot.repMax ?? slot.repMin ?? "?")}`
    : null;

  const close = () => {
    if (noteDraft !== notes) actions.setNotes(noteDraft);
    setMenu(false);
  };
  const act = (fn?: () => void) => () => {
    setMenu(false);
    fn?.();
  };

  return (
    <article className={cx("wk-card", complete && "is-complete")} aria-label={info.name}>
      <header className="wk-card__head">
        <div className="wk-card__titles">
          <h3 className="wk-card__name">{info.name}</h3>
          {substitutedFrom && <p className="wk-card__swap">Swapped in for {substitutedFrom}</p>}
        </div>
        {working.length > 0 && (
          <span className="wk-card__count num" aria-label={`${workingDone} of ${working.length} working sets done`}>
            {workingDone}/{working.length}
          </span>
        )}
        <IconButton
          label={`More for ${info.name}`}
          icon={<IconMore />}
          onClick={() => {
            setNoteDraft(notes);
            setMenu(true);
          }}
        />
      </header>

      {(last || target) && (
        <dl className="wk-card__facts">
          {last && (
            <div>
              <dt>Last time</dt>
              <dd className="num">{last}</dd>
            </div>
          )}
          {target && (
            <div>
              <dt>Target</dt>
              <dd className="num">{target}</dd>
            </div>
          )}
        </dl>
      )}
      {hint && hint.action !== "none" && (
        <button type="button" className="wk-hint" aria-expanded={showRule} onClick={() => setShowRule((v) => !v)}>
          <span className="wk-hint__text">
            {hint.action === "increase" ? (
              <>
                Go up to <span className="num">{fmtNum(hint.suggest?.value ?? null)}</span> {settings.unit}
              </>
            ) : hint.action === "hold" ? (
              "Hold the weight"
            ) : (
              "Add reps"
            )}
          </span>
          <span className="wk-hint__why">{showRule ? "Hide rule" : "Why?"}</span>
        </button>
      )}
      {showRule && hint && (
        <p className="wk-card__rule">
          {hint.reason} <span className="wk-card__rulename">{hint.rule}</span>
        </p>
      )}
      {notes && <p className="wk-card__note">{notes}</p>}

      <ol className="wk-sets">
        {sets.map((row) => {
          const s = row.data.done ? row.data : actions.preview(row);
          const warm = s.kind === "warmup";
          const label = warm ? "W" : String(++workingNo);
          const c = cell(s, info, settings);
          const desc = `${warm ? "Warm-up" : `Set ${label}`}: ${spoken(c, s.reps, timed)}`;
          const isNext = !s.done && row.cid === nextCid;
          return (
            <li key={row.cid} className={cx("wk-set", s.done && "is-done", warm && "is-warm", isNext && "is-next")}>
              <span className="wk-set__badge num" aria-hidden="true">
                {label}
              </span>
              <button type="button" className="wk-set__values" onClick={() => actions.editSet(row)} aria-label={`Edit ${desc}`}>
                {!timed && (
                  <span className="wk-set__val">
                    <span className="num">{c.main}</span>
                    <small>{c.sub}</small>
                  </span>
                )}
                {!timed && (
                  <span className="wk-set__x" aria-hidden="true">
                    ×
                  </span>
                )}
                <span className="wk-set__val">
                  <span className="num">{timed ? c.main : (s.reps ?? "–")}</span>
                  <small>{timed ? "s" : "reps"}</small>
                </span>
              </button>
              <button
                type="button"
                className="wk-set__check"
                aria-pressed={s.done}
                aria-label={s.done ? `Undo ${desc}` : `Log ${desc}`}
                onClick={() => {
                  setStamped(s.done ? null : row.cid);
                  actions.logSet(row);
                }}
              >
                <IconCheck size={28} className={s.done && stamped === row.cid ? "ui-stamp" : undefined} />
              </button>
            </li>
          );
        })}
      </ol>
      <Button variant="ghost" className="wk-card__add" icon={<IconPlus size={20} />} onClick={actions.addSet}>
        Add set
      </Button>

      <Sheet open={menu} onClose={close} title={info.name}>
        <div className="wk-menu">
          <label className="wk-field">
            <span className="wk-field__label">Notes</span>
            <textarea rows={2} value={noteDraft} onChange={(e) => setNoteDraft(e.currentTarget.value)} placeholder="Seat 4, close grip…" />
          </label>
          <TextField
            label="Rest after each set (seconds)"
            hint={restSec === null ? `Uses your default, ${settings.defaultRestSec} s` : undefined}
            type="text"
            inputMode="numeric"
            defaultValue={restSec ?? ""}
            placeholder={String(settings.defaultRestSec)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim();
              actions.setRest(v === "" ? null : Math.max(0, Math.round(Number(v)) || 0));
            }}
          />
          <div className="wk-menu__grid">
            <Button onClick={act(actions.moveUp)} disabled={!actions.moveUp}>
              Move up
            </Button>
            <Button onClick={act(actions.moveDown)} disabled={!actions.moveDown}>
              Move down
            </Button>
            <Button onClick={act(actions.substitute)}>Substitute</Button>
            <Button onClick={act(actions.addWarmups)} disabled={info.tracking !== "weight_reps"}>
              Add warm-ups
            </Button>
          </div>
          <Button variant="danger" block className="wk-menu__remove" onClick={act(actions.remove)}>
            Remove exercise
          </Button>
        </div>
      </Sheet>
    </article>
  );
}
