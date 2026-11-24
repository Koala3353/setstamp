// Shared session hooks other features import. The settings table holds a single row, cid "settings".
import { useCallback, useMemo } from "react";
import type { SettingsData } from "../../shared/sync";
import { useRow, useSyncStore } from "../../sync/react";
import type { SyncStore } from "../../sync";

export const SETTINGS_CID = "settings";

export const DEFAULT_SETTINGS: Readonly<SettingsData> = Object.freeze({
  unit: "kg",
  bodyweightKg: null,
  availableEquipment: [],
  defaultRestSec: 120,
  barKg: 20,
  platesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  showCommunityImages: true,
  activeProgramCid: null,
  goal: null,
  sessionMinutes: null,
} as SettingsData);

/** Current settings, merged over defaults (defaults when the row doesn't exist yet). */
export function useUserSettings(): SettingsData {
  const row = useRow("settings", SETTINGS_CID);
  const data = row && !row.deleted ? row.data : null;
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(data ?? {}) }), [data]);
}

/** Merge a partial update into the settings row (creates it with defaults if absent). */
export async function updateSettings(store: SyncStore, partial: Partial<SettingsData>): Promise<void> {
  const current = store.get("settings", SETTINGS_CID);
  const base = current && !current.deleted && current.data ? current.data : DEFAULT_SETTINGS;
  await store.write("settings", SETTINGS_CID, { ...base, ...partial });
}

/** Hook form: `const update = useUpdateSettings(); update({ unit: "lb" })`. No-op while no store. */
export function useUpdateSettings(): (partial: Partial<SettingsData>) => Promise<void> {
  const store = useSyncStore();
  return useCallback(
    async (partial: Partial<SettingsData>) => {
      if (store) await updateSettings(store, partial);
    },
    [store],
  );
}
