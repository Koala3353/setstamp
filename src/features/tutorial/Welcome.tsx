// The tour's first card: weight unit and, if there's no program yet, an optional template.
import { useState } from "react";
import { newCid } from "../../sync";
import { useRow, useSyncStore } from "../../sync/react";
import type { Unit } from "../../shared/domain";
import { FilterChip, Segmented } from "../../ui";
import { buildFromTemplate } from "../program/templates";
import { useExerciseIndex } from "../program/useProgramData";
import { updateSettings, useUserSettings } from "../session/hooks";
import { unitChange } from "../settings/SettingsView";

type Choice = "later" | "upper_lower" | "ppl3" | "full_body";

const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: "upper_lower", label: "Upper / lower" },
  { value: "ppl3", label: "Push / pull / legs" },
  { value: "full_body", label: "Full body" },
  { value: "later", label: "Set up later" },
];

export type WelcomeState = ReturnType<typeof useWelcomeChoices>;

export function useWelcomeChoices() {
  const store = useSyncStore();
  const settings = useUserSettings();
  const exercises = useExerciseIndex();
  const program = useRow("programs", settings.activeProgramCid);
  const hasProgram = !!program?.data && !program.deleted && !program.data.archived;
  const [unit, setUnit] = useState<Unit>(settings.unit);
  const [choice, setChoice] = useState<Choice>("later");
  const catalogReady = exercises.list.length > 0;

  const apply = async () => {
    if (!store) return;
    if (unit !== settings.unit) await updateSettings(store, unitChange(settings, unit));
    if (!hasProgram && choice !== "later" && catalogReady) {
      const built = buildFromTemplate(choice, exercises.list, settings.availableEquipment, newCid);
      const cid = newCid();
      await store.write("programs", cid, built.data);
      await updateSettings(store, { activeProgramCid: cid });
    }
  };

  return {
    unit,
    setUnit,
    choice,
    setChoice,
    hasProgram,
    catalogReady,
    ready: !!store,
    apply,
  };
}

export function WelcomeChoices({ state }: { state: WelcomeState }) {
  return (
    <div className="tour__form">
      <div className="tour__field">
        <span className="tour__label" id="tour-unit">
          Weight unit
        </span>
        <Segmented<Unit>
          label="Weight unit"
          value={state.unit}
          onChange={state.setUnit}
          options={[
            { value: "kg", label: "Kilograms" },
            { value: "lb", label: "Pounds" },
          ]}
        />
      </div>
      {!state.hasProgram && (
        <div className="tour__field">
          <span className="tour__label">Program</span>
          <div className="tour__chips" role="group" aria-label="Program">
            {CHOICES.map((c) => (
              <FilterChip
                key={c.value}
                selected={state.choice === c.value}
                disabled={c.value !== "later" && !state.catalogReady}
                onChange={() => state.setChoice(c.value)}
              >
                {c.label}
              </FilterChip>
            ))}
          </div>
          <p className="tour__note">
            {state.catalogReady
              ? "Days run in order. You can change or replace the program any time."
              : "Templates need the exercise list, which is still downloading. You can pick one later under Program."}
          </p>
        </div>
      )}
    </div>
  );
}
