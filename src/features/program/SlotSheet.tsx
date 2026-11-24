// Edit one planned slot: sets, rep range or hold time, rest, warm-up suggestion, alternates.
import { useEffect, useState } from "react";
import type { PlannedSlot } from "../../shared/sync";
import { Button, IconTrash, ListGroup, ListRow, Segmented, Sheet, Stepper, Switch } from "../../ui";
import type { ExerciseLookup } from "../coverage/coverage";
import { isHold, usesReps } from "../../logic/tracking";

type Props = {
  slot: PlannedSlot | null;
  lookup: ExerciseLookup;
  defaultRestSec: number;
  onClose: () => void;
  onChange: (slot: PlannedSlot) => void;
  onRemove: (slotId: string) => void;
  onSwap: (slotId: string) => void;
  onAddAlternate: (slotId: string) => void;
  /** Label of the superset this slot is in, if any. */
  superset?: string | null;
  onSupersetNext?: () => void;
  onLeaveSuperset?: () => void;
};

export function SlotSheet({ slot, lookup, defaultRestSec, onClose, onChange, onRemove, onSwap, onAddAlternate, superset, onSupersetNext, onLeaveSuperset }: Props) {
  // Keep the last slot while the sheet animates closed.
  const [shown, setShown] = useState<PlannedSlot | null>(slot);
  useEffect(() => {
    if (slot) setShown(slot);
  }, [slot]);
  const s = slot ?? shown;
  if (!s) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const ex = lookup(s.exId);
  const target = s.durationSec != null ? "time" : "reps";
  // Carries and timed cardio have no rep or hold target.
  const noTarget = ex ? !isHold(ex.tracking) && !usesReps(ex.tracking) : false;
  const set = (patch: Partial<PlannedSlot>) => onChange({ ...s, ...patch });

  return (
    <Sheet
      open={slot !== null}
      onClose={onClose}
      title={ex?.name ?? "Exercise"}
      footer={
        <Button variant="primary" size="lg" block onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="prog-form">
        <Stepper label="Working sets" value={s.sets} min={1} max={12} step={1} inputMode="numeric" onChange={(v) => set({ sets: Math.max(1, v ?? 1) })} />
        {noTarget ? (
          <p className="small muted">Logged as {ex?.tracking === "weight_distance" ? "weight and distance" : "distance and time"}, so there is no rep or hold target.</p>
        ) : (
        <>
        <Segmented
          label="Target"
          options={[
            { value: "reps", label: "Rep range" },
            { value: "time", label: "Hold time" },
          ]}
          value={target}
          onChange={(v) =>
            v === "time"
              ? set({ durationSec: s.durationSec ?? 30, repMin: null, repMax: null })
              : set({ durationSec: null, repMin: s.repMin ?? 8, repMax: s.repMax ?? 12 })
          }
        />
        {target === "reps" ? (
          <div className="prog-form__pair">
            <Stepper
              label="Reps from"
              value={s.repMin}
              min={1}
              max={100}
              inputMode="numeric"
              onChange={(v) => set({ repMin: v, repMax: v != null && s.repMax != null && s.repMax < v ? v : s.repMax })}
            />
            <Stepper
              label="to"
              value={s.repMax}
              min={1}
              max={100}
              inputMode="numeric"
              onChange={(v) => set({ repMax: v, repMin: v != null && s.repMin != null && s.repMin > v ? v : s.repMin })}
            />
          </div>
        ) : (
          <Stepper label="Hold" unit="s" value={s.durationSec} min={5} max={600} step={5} inputMode="numeric" onChange={(v) => set({ durationSec: v ?? 30 })} />
        )}
        </>
        )}
        <Stepper
          label="Rest"
          unit="s"
          value={s.restSec}
          placeholder={String(defaultRestSec)}
          hint={s.restSec == null ? `Uses your default (${defaultRestSec}s)` : undefined}
          min={0}
          max={600}
          step={15}
          inputMode="numeric"
          onChange={(v) => set({ restSec: v })}
        />
        <Switch
          checked={s.warmup}
          onChange={(warmup) => set({ warmup })}
          label="Suggest warm-up sets"
          description="Warm-ups are suggested when the workout starts and don't count as working sets."
        />

        <div className="prog-form__group">
          <h3 className="cov-sheet__title">Alternates</h3>
          <p className="small muted">Pre-approved swaps for when equipment is busy. Offered first when you substitute during a workout.</p>
          {s.alternates.length > 0 && (
            <ListGroup label="Alternates">
              {s.alternates.map((a) => (
                <li key={a}>
                  <ListRow
                    title={lookup(a)?.name ?? a}
                    trailing={
                      <Button variant="ghost" aria-label={`Remove ${lookup(a)?.name ?? a}`} onClick={() => set({ alternates: s.alternates.filter((x) => x !== a) })}>
                        Remove
                      </Button>
                    }
                  />
                </li>
              ))}
            </ListGroup>
          )}
          <Button variant="secondary" onClick={() => onAddAlternate(s.slotId)}>
            Add alternate
          </Button>
        </div>

        {(onSupersetNext || onLeaveSuperset) && (
          <div className="prog-form__group">
            <h3 className="cov-sheet__title">Superset</h3>
            <p className="small muted">
              {superset
                ? `Part of superset ${superset}: done round by round, resting after each round for the longest rest in the group.`
                : "Pair with the next exercise and do them back to back, resting after each round."}
            </p>
            {onSupersetNext && (
              <Button variant="secondary" onClick={onSupersetNext}>
                Superset with next
              </Button>
            )}
            {onLeaveSuperset && (
              <Button variant="secondary" onClick={onLeaveSuperset}>
                Remove from superset
              </Button>
            )}
          </div>
        )}

        <div className="prog-form__actions">
          <Button variant="secondary" onClick={() => onSwap(s.slotId)}>
            Swap exercise
          </Button>
          <Button variant="danger" icon={<IconTrash size={20} />} onClick={() => onRemove(s.slotId)}>
            Remove
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
