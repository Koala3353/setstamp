// One exercise in the session: last time, target, set rows with a one-tap ✓, and a menu for the rest.
import { useState, type ReactNode } from "react";
import type { SortItemBind } from "../../ui";
import "./reorder.css";
import { cx } from "../../ui";
import type { PlannedSlot, SetData, SettingsData } from "../../shared/sync";
import { Button, IconButton, IconCheck, IconInfo, IconMore, IconPlus, Sheet, TextField } from "../../ui";
import { navigate, pathFor } from "../../app/router";
import { formatLast, type PreviousPerformance } from "../../logic/history";
import type { ProgressionHint } from "../../logic/progression";
import { fmtNum } from "../../logic/units";
import { isLoaded } from "../../logic/tracking";
import { setCells, spokenSet } from "./setCells";
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
  /** Present when there is a next exercise to pair with. */
  supersetNext?: () => void;
  /** Present when this exercise is in a superset. */
  leaveSuperset?: () => void;
};

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
  superset,
  actions,
  sortItem,
  handle,
}: {
  /** Drag-and-drop binding from the list (useSortable). */
  sortItem?: SortItemBind;
  /** Drag handle, shown at the start of the header. */
  handle?: ReactNode;
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
  /** Label of the superset this card is in ("A"), with its round rest in seconds. */
  superset: { label: string; restSec: number } | null;
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
  let workingNo = 0;
  const last = prev ? formatLast(prev.sets, info.tracking, settings.unit) : "";
  const target = slot
    ? (() => {
        const t = slot.durationSec ? `${slot.durationSec}s` : slot.repMin != null && slot.repMax != null && slot.repMin !== slot.repMax ? `${slot.repMin}–${slot.repMax}` : (slot.repMax ?? slot.repMin);
        return t == null ? `${slot.sets} ${slot.sets === 1 ? "set" : "sets"}` : `${slot.sets} × ${t}`;
      })()
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
    <article
      ref={sortItem?.ref}
      style={sortItem?.style}
      data-sort-key={sortItem?.["data-sort-key"]}
      className={cx("wk-card", complete && "is-complete", sortItem?.className)}
      aria-label={info.name}
    >
      <header className="wk-card__head">
        {handle}
        <div className="wk-card__titles">
          <h3 className="wk-card__name">{info.name}</h3>
          {substitutedFrom && <p className="wk-card__swap">Swapped in for {substitutedFrom}</p>}
        </div>
        {working.length > 0 && (
          <span className="wk-card__count num" aria-label={`${workingDone} of ${working.length} working sets done`}>
            {workingDone}/{working.length}
          </span>
        )}
        <IconButton label={`About ${info.name}`} icon={<IconInfo />} onClick={() => navigate(pathFor("exercise", { exId: info.exId }))} />
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
          const cells = setCells(s, info.tracking, settings.unit);
          const desc = `${warm ? "Warm-up" : `Set ${label}`}: ${spokenSet(cells)}`;
          const isNext = !s.done && row.cid === nextCid;
          return (
            <li key={row.cid} data-set={row.cid} className={cx("wk-set", s.done && "is-done", warm && "is-warm", isNext && "is-next")}>
              <span className="wk-set__badge num" aria-hidden="true">
                {label}
              </span>
              <button type="button" className="wk-set__values" onClick={() => actions.editSet(row)} aria-label={`Edit ${desc}`}>
                {cells.map((c, k) => (
                  <span key={k} className="wk-set__pair">
                    {k > 0 && (
                      <span className="wk-set__x" aria-hidden="true">
                        ×
                      </span>
                    )}
                    <span className="wk-set__val">
                      <span className="num">{c.main}</span>
                      {c.sub && <small>{c.sub}</small>}
                    </span>
                  </span>
                ))}
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
            hint={
              superset
                ? `In superset ${superset.label}, rest starts after each round and lasts the longest rest in the group (now ${superset.restSec} s).`
                : restSec === null
                  ? `Uses your default, ${settings.defaultRestSec} s`
                  : undefined
            }
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
            <Button onClick={act(actions.addWarmups)} disabled={!isLoaded(info.tracking)}>
              Add warm-ups
            </Button>
            {superset ? (
              <Button onClick={act(actions.leaveSuperset)} disabled={!actions.leaveSuperset}>
                Remove from superset
              </Button>
            ) : null}
            {actions.supersetNext ? <Button onClick={act(actions.supersetNext)}>Superset with next</Button> : null}
          </div>
          <Button variant="danger" block className="wk-menu__remove" onClick={act(actions.remove)}>
            Remove exercise
          </Button>
        </div>
      </Sheet>
    </article>
  );
}
