// Dev-only preview: open /src/bodymap/preview.html with the Vite dev server.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { MUSCLE_INFO, type Muscle } from "../shared/domain";
import { BodyMap, BodyMapLegend, MiniBodyMap, MuscleChips, involvementLevels, volumeLevels, type BodyMapMode } from "./index";

// Sample lower-body day.
const DAY: { name: string; primary: Muscle[]; secondary: Muscle[]; sets: number }[] = [
  { name: "Back squat", primary: ["quads", "glutes"], secondary: ["adductors", "lower_back", "abs"], sets: 4 },
  { name: "Romanian deadlift", primary: ["hamstrings", "glutes"], secondary: ["lower_back", "adductors", "forearms", "traps"], sets: 3 },
  { name: "Lying leg curl", primary: ["hamstrings"], secondary: ["calves"], sets: 3 },
  { name: "Standing calf raise", primary: ["calves"], secondary: [], sets: 4 },
];

function Preview() {
  const [mode, setMode] = useState<BodyMapMode>("involvement");
  const [selected, setSelected] = useState<Muscle | null>(null);
  const levels = mode === "volume" ? volumeLevels(DAY) : involvementLevels(DAY);
  const hits = selected ? DAY.filter((e) => e.primary.includes(selected) || e.secondary.includes(selected)) : [];
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>Body map preview</h1>
      <div role="radiogroup" aria-label="Mode" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["involvement", "volume"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} style={{ minHeight: 44, padding: "0 14px", fontWeight: mode === m ? 700 : 400 }}>
            {m}
          </button>
        ))}
      </div>
      <BodyMap levels={levels} mode={mode} selected={selected} onSelect={setSelected} />
      <BodyMapLegend mode={mode} />
      <MuscleChips levels={levels} mode={mode} selected={selected} onSelect={setSelected} />
      <p aria-live="polite" style={{ minHeight: 24 }}>
        {selected ? `${MUSCLE_INFO[selected].label}: ${hits.map((e) => e.name).join(", ") || "no exercises today"}` : "Tap a muscle"}
      </p>
      <h2 style={{ fontSize: 16 }}>Exercise thumbnails</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {DAY.map((e) => (
          <li key={e.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
            <MiniBodyMap levels={involvementLevels([e])} />
            <span>
              {e.name}
              <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                {" "}— works {e.primary.map((m) => MUSCLE_INFO[m].label).join(", ")}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <h2 style={{ fontSize: 16 }}>Compact</h2>
      <BodyMap levels={levels} mode={mode} compact />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
