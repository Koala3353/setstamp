import { ExerciseDetail } from "../../features/exercises";

/** Exercise detail (#/exercises/:exId). */
export function ExerciseScreen({ exId }: { exId: string }) {
  return (
    <div className="screen">
      <ExerciseDetail key={exId} exId={exId} />
    </div>
  );
}
