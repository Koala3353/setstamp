import { useState } from "react";
import { EQUIPMENT, EQUIPMENT_LABEL, MUSCLE_GROUPS, PATTERNS, TRACKING } from "../../shared/domain";
import { ChipRow, FilterChip } from "../../ui";
import type { FilterState } from "./filters";
import { GROUP_LABEL, PATTERN_LABEL, TRACKING_LABEL } from "./labels";

type Facet = "groups" | "equipment" | "patterns" | "tracking";

const FACETS: Array<{
  key: Facet;
  label: string;
  options: readonly string[];
  labelOf: (v: string) => string;
}> = [
  {
    key: "groups",
    label: "Muscle",
    options: MUSCLE_GROUPS,
    labelOf: (v) => GROUP_LABEL[v as keyof typeof GROUP_LABEL],
  },
  {
    key: "equipment",
    label: "Equipment",
    options: EQUIPMENT,
    labelOf: (v) => EQUIPMENT_LABEL[v as keyof typeof EQUIPMENT_LABEL],
  },
  {
    key: "patterns",
    label: "Movement",
    options: PATTERNS,
    labelOf: (v) => PATTERN_LABEL[v as keyof typeof PATTERN_LABEL],
  },
  {
    key: "tracking",
    label: "Tracking",
    options: TRACKING,
    labelOf: (v) => TRACKING_LABEL[v as keyof typeof TRACKING_LABEL],
  },
];

/** Facet chips; tapping one opens its options in a second row. "My equipment" shows when set. */
export function FilterBar({
  value,
  onChange,
  canFilterMyEquipment,
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  canFilterMyEquipment: boolean;
}) {
  const [open, setOpen] = useState<Facet | null>(null);
  const facet = FACETS.find((f) => f.key === open);
  const selected = (k: Facet) => value[k] as string[];

  return (
    <div className="exfilters">
      <ChipRow label="Filters">
        {canFilterMyEquipment && (
          <FilterChip selected={value.myEquipment} onChange={(on) => onChange({ ...value, myEquipment: on })}>
            My equipment
          </FilterChip>
        )}
        {FACETS.map((f) => {
          const n = selected(f.key).length;
          return (
            <FilterChip
              key={f.key}
              selected={n > 0}
              aria-expanded={open === f.key}
              className={open === f.key ? "is-open" : undefined}
              count={n || undefined}
              onChange={() => setOpen(open === f.key ? null : f.key)}
            >
              {f.label}
            </FilterChip>
          );
        })}
      </ChipRow>
      {facet && (
        <ChipRow label={`${facet.label} options`}>
          {facet.options.map((o) => {
            const cur = selected(facet.key);
            const on = cur.includes(o);
            return (
              <FilterChip
                key={o}
                selected={on}
                onChange={(next) =>
                  onChange({
                    ...value,
                    [facet.key]: next ? [...cur, o] : cur.filter((x) => x !== o),
                  } as FilterState)
                }
              >
                {facet.labelOf(o)}
              </FilterChip>
            );
          })}
        </ChipRow>
      )}
    </div>
  );
}
