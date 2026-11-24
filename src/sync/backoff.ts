export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 60_000;

/**
 * Exponential backoff with jitter: failure 1 ≈ 1s, 2 ≈ 2s, 3 ≈ 4s … capped at 60s.
 * Jitter is ±25% so tabs/devices that failed together don't retry in lockstep.
 */
export function backoffDelay(failures: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(failures));
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (n - 1));
  const jittered = base * (0.75 + 0.5 * random());
  return Math.round(Math.min(BACKOFF_MAX_MS, jittered));
}
