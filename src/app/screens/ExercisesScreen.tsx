import { ExerciseBrowser } from "../../features/exercises";

/** Exercises tab (#/exercises): search, filter and browse; rows open the detail screen. */
export function ExercisesScreen() {
  return (
    <div className="screen">
      <ExerciseBrowser mode="navigate" inputId="ex-search" />
    </div>
  );
}
