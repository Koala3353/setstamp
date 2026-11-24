import type { Equipment, MuscleGroup, Pattern, Tracking } from "../../shared/domain";
import type { SearchFilters } from "../../search";
import { musclesInGroups } from "./labels";

export type FilterState = {
  equipment: Equipment[];
  groups: MuscleGroup[];
  patterns: Pattern[];
  tracking: Tracking[];
  /** Hide exercises needing equipment the user doesn't have (settings.availableEquipment). */
  myEquipment: boolean;
};

export const EMPTY_FILTERS: FilterState = {
  equipment: [],
  groups: [],
  patterns: [],
  tracking: [],
  myEquipment: false,
};

export function toSearchFilters(f: FilterState): SearchFilters | undefined {
  const out: SearchFilters = {};
  if (f.equipment.length) out.equipment = f.equipment;
  if (f.groups.length) out.muscles = musclesInGroups(f.groups);
  if (f.patterns.length) out.patterns = f.patterns;
  if (f.tracking.length) out.tracking = f.tracking;
  return Object.keys(out).length ? out : undefined;
}

/** Apply a "relax filter" suggestion: a facet missing from `relaxed` is cleared. */
export function applyRelaxed(f: FilterState, relaxed: SearchFilters): FilterState {
  return {
    ...f,
    equipment: relaxed.equipment?.length ? f.equipment : [],
    groups: relaxed.muscles?.length ? f.groups : [],
    patterns: relaxed.patterns?.length ? f.patterns : [],
    tracking: relaxed.tracking?.length ? f.tracking : [],
  };
}

export const hasFacetFilters = (f: FilterState) => f.equipment.length + f.groups.length + f.patterns.length + f.tracking.length > 0;
