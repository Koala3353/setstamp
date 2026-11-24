// Plate calculator: what to load on each side of a bar for a target total (all kg).
// Plate denominations are treated as available in pairs, as many as needed.

const EPS = 1e-6;

export type PlateLoad = {
  /** Plates for one side, heaviest first. */
  perSide: number[];
  /** Total actually loadable (bar + 2 × perSide). */
  loadedKg: number;
  /** target − loaded; > 0 when the target cannot be made exactly. */
  remainderKg: number;
  /** Target below the empty bar. */
  belowBar: boolean;
};

export function platesPerSide(targetKg: number, barKg: number, platesKg: readonly number[]): PlateLoad {
  const denoms = [...new Set(platesKg.filter((p) => p > 0))].sort((a, b) => b - a);
  if (targetKg < barKg - EPS) return { perSide: [], loadedKg: barKg, remainderKg: targetKg - barKg, belowBar: true };
  let side = (targetKg - barKg) / 2;
  const perSide: number[] = [];
  for (const p of denoms) {
    while (side + EPS >= p) {
      perSide.push(p);
      side -= p;
    }
  }
  const loadedKg = barKg + 2 * perSide.reduce((s, p) => s + p, 0);
  const remainderKg = Math.abs(targetKg - loadedKg) < EPS ? 0 : targetKg - loadedKg;
  return { perSide, loadedKg, remainderKg, belowBar: false };
}

/** Largest loadable total ≤ target (never below the bar). */
export function roundDownToLoadable(targetKg: number, barKg: number, platesKg: readonly number[]): number {
  return platesPerSide(targetKg, barKg, platesKg).loadedKg;
}

/** Nearest loadable total to target (ties go down). */
export function roundToLoadable(targetKg: number, barKg: number, platesKg: readonly number[]): number {
  const down = platesPerSide(targetKg, barKg, platesKg).loadedKg;
  if (Math.abs(down - targetKg) < EPS) return down;
  const smallest = Math.min(...platesKg.filter((p) => p > 0));
  if (!Number.isFinite(smallest)) return down;
  // Next loadable step above: try adding the smallest pair and re-greedy.
  const up = platesPerSide(down + 2 * smallest, barKg, platesKg).loadedKg;
  return up - targetKg < targetKg - down ? up : down;
}
