// Bounded Damerau-Levenshtein (optimal string alignment: insert, delete, substitute,
// adjacent transposition). Returns `max + 1` as soon as the distance must exceed `max`.

let bufA = new Int32Array(64);
let bufB = new Int32Array(64);
let bufC = new Int32Array(64);

/** `bLen` compares `a` against only the first `bLen` chars of `b` (no slicing). */
export function damerauLevenshtein(a: string, b: string, max = Number.MAX_SAFE_INTEGER, bLen = b.length): number {
  const n = a.length;
  const m = Math.min(bLen, b.length);
  if (Math.abs(n - m) > max) return max + 1;
  if (n === 0) return m;
  if (m === 0) return n;
  if (bufA.length <= m) {
    bufA = new Int32Array(m + 1);
    bufB = new Int32Array(m + 1);
    bufC = new Int32Array(m + 1);
  }
  let prev2 = bufA;
  let prev = bufB;
  let cur = bufC;
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const ai = a.charCodeAt(i - 1);
    const aPrev = i > 1 ? a.charCodeAt(i - 2) : -1;
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = prev[j - 1] + (ai === bj ? 0 : 1);
      const del = prev[j] + 1;
      if (del < v) v = del;
      const ins = cur[j - 1] + 1;
      if (ins < v) v = ins;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && aPrev === bj) {
        const tr = prev2[j - 2] + 1;
        if (tr < v) v = tr;
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev2;
    prev2 = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[m];
}

/** Edit budget by token length: none for ≤3, 1 for 4–7, 2 for ≥8. */
export function maxEditsFor(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}
