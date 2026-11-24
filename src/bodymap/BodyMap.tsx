import { useId, type KeyboardEvent, type MouseEvent } from "react";
import { MUSCLE_INFO, type Muscle } from "../shared/domain";
import { displayStep, sortedInvolved, VOLUME_STEP_LABELS, type BodyMapMode, type MuscleLevels } from "./levels";
import {
  DETAIL_PATHS,
  FIGURE_H,
  FIGURE_W,
  MUSCLE_PATHS,
  PAINT_ORDER,
  SILHOUETTE,
  SILHOUETTE_OUTLINE,
  SMALL_MUSCLES,
  type View,
} from "./paths";
import "./bodymap.css";

export type BodyMapProps = {
  levels: MuscleLevels;
  mode?: BodyMapMode;
  selected?: Muscle | null;
  onSelect?: (m: Muscle | null) => void;
  compact?: boolean;
  className?: string;
};

const GAP = 20;
const LABEL_H = 22;
const BACK_X = FIGURE_W + GAP;
const VIEW_W = FIGURE_W * 2 + GAP;

/** React ids may contain characters that are awkward inside url(#…). */
function useSafeId(): string {
  return "bm" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** CSS fill for a muscle at a given display step. */
function fillFor(mode: BodyMapMode, step: number, uid: string): string {
  if (step <= 0) return "var(--bm-base)";
  if (mode === "volume") return `var(--bm-vol-${step})`;
  return step >= 2 ? "var(--bm-primary)" : `url(#${uid}-hatch)`;
}

function describe(mode: BodyMapMode, m: Muscle, value: number | undefined): string {
  const label = MUSCLE_INFO[m].label;
  if (mode === "volume") {
    const v = value ?? 0;
    if (v <= 0) return `${label}, no sets`;
    const r = Math.round(v * 10) / 10;
    return `${label}, about ${r} ${r === 1 ? "set" : "sets"}`;
  }
  const step = displayStep("involvement", value);
  return `${label}, ${step === 2 ? "primary" : step === 1 ? "secondary" : "not worked"}`;
}

function HatchDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <pattern id={`${uid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="5" height="5" style={{ fill: "var(--bm-secondary)" }} />
        <line x1="1" y1="0" x2="1" y2="5" style={{ stroke: "var(--bm-hatch)", strokeWidth: 1.6 }} />
      </pattern>
    </defs>
  );
}

type FigureProps = {
  view: View;
  levels: MuscleLevels;
  mode: BodyMapMode;
  uid: string;
  selected: Muscle | null;
  interactive: boolean;
  onPick?: (m: Muscle) => void;
};

function Figure({ view, levels, mode, uid, selected, interactive, onPick }: FigureProps) {
  const regions = MUSCLE_PATHS[view];
  const order = PAINT_ORDER.filter((m) => regions[m]);
  return (
    <g>
      {SILHOUETTE.map((d, i) => (
        <path key={i} d={d} className="bm-silhouette" />
      ))}
      {SILHOUETTE_OUTLINE.map((d, i) => (
        <path key={`o${i}`} d={d} className="bm-silhouette-outline" />
      ))}
      {interactive &&
        order
          .filter((m) => SMALL_MUSCLES.has(m))
          .map((m) =>
            regions[m]!.map((d, i) => (
              <path
                key={`${m}-hit-${i}`}
                d={d}
                className="bm-hit"
                data-muscle={m}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick?.(m);
                }}
              />
            )),
          )}
      {order.map((m) => {
        const step = displayStep(mode, levels[m]);
        const shapes = regions[m]!.map((d, i) => (
          <path key={i} d={d} className="bm-shape" style={{ fill: fillFor(mode, step, uid) }} />
        ));
        if (!interactive) return <g key={m}>{shapes}</g>;
        // A muscle shown on both figures is focusable once (on the front) to avoid duplicate tab stops.
        const tabbable = view === "front" || MUSCLE_INFO[m].view !== "both" || !MUSCLE_PATHS.front[m];
        const isSel = selected === m;
        return (
          <g
            key={m}
            className={`bm-muscle${isSel ? " bm-selected" : ""}`}
            data-muscle={m}
            data-step={step}
            role={tabbable ? "button" : undefined}
            tabIndex={tabbable ? 0 : -1}
            aria-hidden={tabbable ? undefined : true}
            aria-label={tabbable ? describe(mode, m, levels[m]) : undefined}
            aria-pressed={tabbable ? isSel : undefined}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onPick?.(m);
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick?.(m);
              }
            }}
          >
            {shapes}
          </g>
        );
      })}
      {DETAIL_PATHS[view].map((d, i) => (
        <path key={`d${i}`} d={d} className="bm-detail" />
      ))}
    </g>
  );
}

/** Interactive front/back muscle map. */
export function BodyMap({ levels, mode = "involvement", selected = null, onSelect, compact = false, className }: BodyMapProps) {
  const uid = useSafeId();
  const pick = (m: Muscle) => onSelect?.(selected === m ? null : m);
  const h = FIGURE_H + (compact ? 0 : LABEL_H);
  return (
    <svg
      className={`bm-root${compact ? " bm-compact" : ""}${className ? ` ${className}` : ""}`}
      viewBox={`-4 -2 ${VIEW_W + 8} ${h + 4}`}
      role="group"
      aria-label={mode === "volume" ? "Muscle map, estimated weekly sets" : "Muscle map, front and back"}
      onClick={() => onSelect?.(null)}
    >
      <HatchDefs uid={uid} />
      <Figure view="front" levels={levels} mode={mode} uid={uid} selected={selected} interactive onPick={pick} />
      <g transform={`translate(${BACK_X} 0)`}>
        <Figure view="back" levels={levels} mode={mode} uid={uid} selected={selected} interactive onPick={pick} />
      </g>
      {!compact && (
        <g aria-hidden="true">
          <text className="bm-view-label" x={FIGURE_W / 2} y={FIGURE_H + 17}>
            Front
          </text>
          <text className="bm-view-label" x={BACK_X + FIGURE_W / 2} y={FIGURE_H + 17}>
            Back
          </text>
        </g>
      )}
    </svg>
  );
}

/** Compact, non-interactive thumbnail (~64px tall). The parent supplies the text alternative. */
export function MiniBodyMap({
  levels,
  mode = "involvement",
  className,
}: {
  levels: MuscleLevels;
  mode?: BodyMapMode;
  className?: string;
}) {
  const uid = useSafeId();
  return (
    <svg
      className={`bm-root bm-mini${className ? ` ${className}` : ""}`}
      viewBox={`-4 -2 ${VIEW_W + 8} ${FIGURE_H + 4}`}
      aria-hidden="true"
      focusable="false"
    >
      <HatchDefs uid={uid} />
      <Figure view="front" levels={levels} mode={mode} uid={uid} selected={null} interactive={false} />
      <g transform={`translate(${BACK_X} 0)`}>
        <Figure view="back" levels={levels} mode={mode} uid={uid} selected={null} interactive={false} />
      </g>
    </svg>
  );
}

function Swatch({ fill, uid, withHatch }: { fill: string; uid: string; withHatch?: boolean }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      {withHatch && <HatchDefs uid={uid} />}
      <rect x="1" y="1" width="16" height="16" rx="4" style={{ fill, stroke: "var(--bm-outline)", strokeWidth: 1 }} />
    </svg>
  );
}

/** Legend explaining fills. Primary = solid; secondary = lighter + diagonal hatch. */
export function BodyMapLegend({ mode = "involvement", className }: { mode?: BodyMapMode; className?: string }) {
  const uid = useSafeId();
  if (mode === "volume") {
    return (
      <ul className={`bm-legend${className ? ` ${className}` : ""}`} aria-label="Legend: estimated weekly sets">
        {[1, 2, 3, 4].map((s) => (
          <li key={s}>
            <Swatch fill={`var(--bm-vol-${s})`} uid={uid} />
            {VOLUME_STEP_LABELS[s]} sets
          </li>
        ))}
        <li className="bm-note">Estimate: primary sets count 1, secondary 0.5</li>
      </ul>
    );
  }
  return (
    <ul className={`bm-legend${className ? ` ${className}` : ""}`} aria-label="Legend">
      <li>
        <Swatch fill="var(--bm-primary)" uid={uid} />
        Primary
      </li>
      <li>
        <Swatch fill={`url(#${uid}-hatch)`} uid={uid} withHatch />
        Secondary
      </li>
    </ul>
  );
}

/**
 * Labelled, 44px-tall buttons for every involved muscle (primary / highest volume first).
 * A large-target alternative to tapping small regions on the figure.
 */
export function MuscleChips({
  levels,
  mode = "involvement",
  selected = null,
  onSelect,
  className,
}: {
  levels: MuscleLevels;
  mode?: BodyMapMode;
  selected?: Muscle | null;
  onSelect?: (m: Muscle | null) => void;
  className?: string;
}) {
  const uid = useSafeId();
  const muscles = sortedInvolved(levels);
  if (muscles.length === 0) return null;
  return (
    <ul className={`bm-chips${className ? ` ${className}` : ""}`}>
      {muscles.map((m) => {
        const step = displayStep(mode, levels[m]);
        const meta =
          mode === "volume"
            ? `~${Math.round((levels[m] ?? 0) * 10) / 10}`
            : step === 2
              ? "primary"
              : "secondary";
        return (
          <li key={m}>
            <button
              type="button"
              className="bm-chip"
              aria-pressed={selected === m}
              aria-label={describe(mode, m, levels[m])}
              onClick={() => onSelect?.(selected === m ? null : m)}
            >
              <Swatch fill={fillFor(mode, step, `${uid}-${m}`)} uid={`${uid}-${m}`} withHatch={mode !== "volume" && step === 1} />
              {MUSCLE_INFO[m].label}
              <span className="bm-chip-meta">{meta}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
