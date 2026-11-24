import "./exercises.css";

/** Data and image credits. Drop into Settings / About. */
export function Credits({ className }: { className?: string }) {
  return (
    <div className={className ? `excredits ${className}` : "excredits"}>
      <p>
        Exercise data by{" "}
        <a href="https://repdb.co" target="_blank" rel="noopener noreferrer">
          RepDB (repdb.co)
        </a>
        .
      </p>
      <p>
        Base catalog from{" "}
        <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">
          free-exercise-db
        </a>
        , released under the Unlicense.
      </p>
      <p className="excredits__note">
        Community images come from free-exercise-db and their origin isn't verified. You can hide them in Settings.
      </p>
    </div>
  );
}
