// On-device exercise search wired to the user's data. The index is built once per catalog /
// custom-exercise change; personal signals (measured usage, favorites, equipment) feed ranking.
import { useCallback, useMemo } from "react";
import type { CatalogExercise, Muscle } from "../../shared/domain";
import { buildSearchIndex, search, type PersonalSignals, type SearchFilters, type SearchIndex, type SearchResponse } from "../../search";
import { useCatalog, useRows, useSyncStore } from "../../sync/react";
import { useUserSettings } from "../session/hooks";
import { buildEntries, deriveUsage, resolveExId, type ExerciseEntry, type MeasuredUsage, type UsageSet } from "./model";

export type ExerciseSearch = {
  entries: readonly ExerciseEntry[];
  /** Look up by exId; follows merged catalog ids. */
  get: (exId: string) => ExerciseEntry | undefined;
  /** Canonical exId (after merges). */
  resolve: (exId: string) => string;
  usage: MeasuredUsage;
  favorites: ReadonlySet<string>;
  personal: PersonalSignals;
  run: (query: string, opts?: { filters?: SearchFilters; limit?: number }) => SearchResponse<ExerciseEntry>;
  ready: boolean;
};

type Built = {
  catalog: unknown;
  custom: unknown;
  entries: ExerciseEntry[];
  index: SearchIndex<ExerciseEntry>;
};
let built: Built | null = null;

/** One index per (catalog, custom rows) snapshot, shared by every mounted consumer. */
function sharedIndex(catalog: readonly CatalogExercise[], custom: Parameters<typeof buildEntries>[1]): Built {
  if (built && built.catalog === catalog && built.custom === custom) return built;
  const entries = buildEntries(catalog, custom);
  built = { catalog, custom, entries, index: buildSearchIndex(entries) };
  return built;
}

export function useExerciseSearch(opts: { sessionMuscles?: readonly Muscle[] } = {}): ExerciseSearch {
  const catalog = useCatalog();
  const customRows = useRows("customExercises");
  const setRows = useRows("sets");
  const favRows = useRows("favorites");
  const settings = useUserSettings();

  const { entries, index } = useMemo(() => sharedIndex(catalog, customRows), [catalog, customRows]);
  const catalogById = useMemo(() => new Map<string, CatalogExercise>(catalog.map((c) => [c.exId, c])), [catalog]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.exId, e])), [entries]);

  const usage = useMemo(
    () => deriveUsage(setRows.flatMap((r): UsageSet[] => (r.data ? [{ ...r.data, updatedAt: r.updatedAt }] : []))),
    [setRows],
  );
  const favorites = useMemo(() => new Set(favRows.flatMap((r) => (r.data ? [r.data.exId] : []))), [favRows]);

  const sessionKey = opts.sessionMuscles?.join(",") ?? "";
  const equipKey = settings.availableEquipment.join(",");
  const personal = useMemo<PersonalSignals>(
    () => ({
      recent: usage.recent,
      frequency: usage.frequency,
      favorites,
      availableEquipment: equipKey ? (equipKey.split(",") as PersonalSignals["availableEquipment"]) : undefined,
      sessionMuscles: sessionKey ? (sessionKey.split(",") as Muscle[]) : undefined,
    }),
    [usage, favorites, equipKey, sessionKey],
  );

  const resolve = useCallback((exId: string) => resolveExId(exId, catalogById), [catalogById]);
  const get = useCallback((exId: string) => byId.get(resolve(exId)), [byId, resolve]);
  const run = useCallback(
    (query: string, o: { filters?: SearchFilters; limit?: number } = {}) =>
      search(index, query, { filters: o.filters, personal, limit: o.limit }),
    [index, personal],
  );

  return {
    entries,
    get,
    resolve,
    usage,
    favorites,
    personal,
    run,
    ready: catalog.length > 0 || entries.length > 0,
  };
}

/** Toggle a favorite. Removes every live row for the exId (rows from other devices too). */
export function useToggleFavorite(): (exId: string) => Promise<void> {
  const store = useSyncStore();
  const favRows = useRows("favorites");
  return useCallback(
    async (exId: string) => {
      if (!store) return;
      const existing = favRows.filter((r) => r.data?.exId === exId);
      if (existing.length) await Promise.all(existing.map((r) => store.remove("favorites", r.cid)));
      else await store.write("favorites", "fav_" + exId, { exId });
    },
    [store, favRows],
  );
}
