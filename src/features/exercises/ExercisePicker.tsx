// Full-height exercise picker sheet used by other features (workout, program editor).
import { useCallback, useEffect, useId, useState } from "react";
import type { Muscle } from "../../shared/domain";
import { Button, Sheet } from "../../ui";
import { ExerciseBrowser } from "./ExerciseBrowser";
import { useExerciseSearch } from "./useExerciseSearch";

export type ExercisePickerProps = {
  open: boolean;
  onClose: () => void;
  /** Single pick (also called for Enter on the top result). The picker does not close itself. */
  onPick: (exId: string) => void;
  title?: string;
  /** substitute: with an empty query, lists ranked swaps for `substituteFor` with reasons. */
  mode?: "add" | "substitute";
  substituteFor?: string;
  /** Muscles already trained this session (boosts exercises for other muscles). */
  sessionMuscles?: Muscle[];
  /** Multi-select: rows toggle; footer button calls onPickMany. */
  multi?: boolean;
  onPickMany?: (exIds: string[]) => void;
};

export function ExercisePicker({
  open,
  onClose,
  onPick,
  title,
  mode = "add",
  substituteFor,
  sessionMuscles,
  multi = false,
  onPickMany,
}: ExercisePickerProps) {
  const inputId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [session, setSession] = useState(0);
  const xs = useExerciseSearch();
  const targetName = substituteFor ? xs.get(substituteFor)?.name : undefined;

  // Fresh state every time it opens.
  useEffect(() => {
    if (open) {
      setSelected([]);
      setSession((n) => n + 1);
    }
  }, [open]);

  const toggle = useCallback(
    (exId: string) => setSelected((cur) => (cur.includes(exId) ? cur.filter((x) => x !== exId) : [...cur, exId])),
    [],
  );

  const heading = title ?? (mode === "substitute" ? "Swap exercise" : multi ? "Add exercises" : "Add exercise");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={heading}
      description={mode === "substitute" && targetName ? `Replacing ${targetName}` : undefined}
      className="expicker"
      footer={
        multi ? (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={selected.length === 0}
            onClick={() => {
              if (onPickMany) onPickMany(selected);
              else selected.forEach(onPick);
            }}
          >
            {selected.length ? `Add ${selected.length} exercise${selected.length === 1 ? "" : "s"}` : "Select exercises"}
          </Button>
        ) : undefined
      }
    >
      {open && (
        <ExerciseBrowser
          key={session}
          mode="pick"
          inputId={inputId}
          autoFocus
          onPick={onPick}
          selected={multi ? selected : undefined}
          onToggleSelected={multi ? toggle : undefined}
          substituteFor={mode === "substitute" ? substituteFor : undefined}
          sessionMuscles={sessionMuscles}
        />
      )}
    </Sheet>
  );
}
