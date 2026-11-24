// Supersets: adjacent items (session exercises or program slots) that share a groupId are done in
// rounds. Every operation here is pure and keeps two rules true:
//   1. a group's members are contiguous;
//   2. a group has at least two members (a lone member is dissolved back to null).
// Items written before supersets existed have no groupId: missing reads as null.

export type Groupable = { groupId?: string | null };

export const groupOf = (x: Groupable): string | null => x.groupId ?? null;

/** Drop groups with fewer than two members and split non-contiguous runs (later runs lose the group). */
export function normalizeGroups<T extends Groupable>(items: readonly T[]): T[] {
  const firstRun = new Map<string, number>(); // groupId -> start index of its first run
  const runLen = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const g = groupOf(items[i]!);
    if (g === null) continue;
    const start = firstRun.get(g);
    if (start === undefined) {
      firstRun.set(g, i);
      runLen.set(g, 1);
    } else if (start + runLen.get(g)! === i) runLen.set(g, runLen.get(g)! + 1);
  }
  return items.map((x, i) => {
    const g = groupOf(x);
    if (g === null) return x;
    const start = firstRun.get(g)!;
    const len = runLen.get(g)!;
    const inFirstRun = i >= start && i < start + len;
    return inFirstRun && len >= 2 ? x : { ...x, groupId: null };
  });
}

/** [start, end] (inclusive) of the block holding index i: its whole group, or just itself. */
export function blockAt(items: readonly Groupable[], i: number): [number, number] {
  const g = groupOf(items[i]!);
  if (g === null) return [i, i];
  let a = i;
  let b = i;
  while (a > 0 && groupOf(items[a - 1]!) === g) a--;
  while (b < items.length - 1 && groupOf(items[b + 1]!) === g) b++;
  return [a, b];
}

/**
 * Link item i with the item after it. If either is already in a group the other joins it
 * (two groups merge into the first). Returns the input unchanged when there is no next item.
 */
export function linkWithNext<T extends Groupable>(items: readonly T[], i: number, newId: string): T[] {
  const a = items[i];
  const b = items[i + 1];
  if (!a || !b) return [...items];
  const target = groupOf(a) ?? groupOf(b) ?? newId;
  const absorbed = groupOf(b);
  return normalizeGroups(
    items.map((x, k) => {
      if (k === i || k === i + 1) return { ...x, groupId: target };
      if (absorbed !== null && absorbed !== target && groupOf(x) === absorbed) return { ...x, groupId: target };
      return x;
    }),
  );
}

/**
 * Take item i out of its superset. A middle member moves to just after the group so the rest
 * stays together; a group left with one member is dissolved.
 */
export function unlink<T extends Groupable>(items: readonly T[], i: number): T[] {
  const x = items[i];
  if (!x || groupOf(x) === null) return [...items];
  const [start, end] = blockAt(items, i);
  const out = [...items];
  if (i === start || i === end) {
    out[i] = { ...x, groupId: null }; // an end member just steps out where it is
    return normalizeGroups(out);
  }
  out.splice(i, 1);
  out.splice(end, 0, { ...x, groupId: null }); // `end` is now one past the shrunk group
  return normalizeGroups(out);
}

/** Remove item i; a group left with one member is dissolved. */
export function removeAt<T extends Groupable>(items: readonly T[], i: number): T[] {
  return normalizeGroups(items.filter((_, k) => k !== i));
}

/**
 * Move item i one step. Inside a superset it swaps with its neighbour in the group; at the edge of
 * a group (or for an ungrouped item) the whole block jumps over the neighbouring block, so moving
 * never splits a group. Returns null when it cannot move.
 */
export function moveItem<T extends Groupable>(items: readonly T[], i: number, dir: -1 | 1): T[] | null {
  const j = i + dir;
  if (!items[i] || !items[j]) return null;
  const g = groupOf(items[i]!);
  if (g !== null && groupOf(items[j]!) === g) {
    const out = [...items];
    [out[i], out[j]] = [out[j]!, out[i]!];
    return out;
  }
  const [a, b] = blockAt(items, i);
  const edge = dir === -1 ? a - 1 : b + 1;
  if (!items[edge]) return null;
  const [c, d] = blockAt(items, edge);
  const mine = items.slice(a, b + 1);
  const theirs = items.slice(c, d + 1);
  const lo = Math.min(a, c);
  const hi = Math.max(b, d);
  return [...items.slice(0, lo), ...(dir === -1 ? [...mine, ...theirs] : [...theirs, ...mine]), ...items.slice(hi + 1)];
}

export const canMove = (items: readonly Groupable[], i: number, dir: -1 | 1) => moveItem(items, i, dir) !== null;

export type SupersetRun = { start: number; end: number; groupId: string; label: string };

/** Contiguous supersets of two or more, labelled A, B, C… in order. */
export function supersetRuns(items: readonly Groupable[]): SupersetRun[] {
  const out: SupersetRun[] = [];
  let i = 0;
  while (i < items.length) {
    const g = groupOf(items[i]!);
    const [, end] = blockAt(items, i);
    if (g !== null && end > i) out.push({ start: i, end, groupId: g, label: String.fromCharCode(65 + (out.length % 26)) });
    i = end + 1;
  }
  return out;
}

// ───────────────────────────── logging rounds ─────────────────────────────

export type RoundSet = { cid: string; kind: "warmup" | "working" | "drop" | "failure"; done: boolean };
export type RoundMember = { key: string; sets: readonly RoundSet[] };

type Step = { cid: string; done: boolean; round: number; member: number };

/**
 * Logging order inside one superset: each member's warm-ups first (member order), then round 1 =
 * every member's first working set, round 2 = every member's second, and so on. A member with
 * fewer sets just drops out of later rounds. An ungrouped exercise is a group of one.
 */
export function roundOrder(members: readonly RoundMember[]): Step[] {
  const out: Step[] = [];
  members.forEach((m, mi) => m.sets.forEach((s) => s.kind === "warmup" && out.push({ cid: s.cid, done: s.done, round: -1, member: mi })));
  const working = members.map((m) => m.sets.filter((s) => s.kind !== "warmup"));
  const rounds = Math.max(0, ...working.map((w) => w.length));
  for (let r = 0; r < rounds; r++)
    working.forEach((w, mi) => {
      const s = w[r];
      if (s) out.push({ cid: s.cid, done: s.done, round: r, member: mi });
    });
  return out;
}

/** The next set to log in this group (null when every set is done). */
export function nextInGroup(members: readonly RoundMember[]): string | null {
  return roundOrder(members).find((s) => !s.done)?.cid ?? null;
}

/**
 * After logging `cid` in a group: whether to start rest now and which set comes next.
 * Rest starts only once every set of that round is done (so the last exercise of the round starts
 * it, whatever order they were ticked in). Warm-ups never start rest.
 */
export function afterLog(members: readonly RoundMember[], cid: string): { rest: boolean; next: string | null } {
  const steps = roundOrder(members).map((s) => (s.cid === cid ? { ...s, done: true } : s));
  const logged = steps.find((s) => s.cid === cid);
  const next = steps.find((s) => !s.done)?.cid ?? null;
  if (!logged || logged.round < 0) return { rest: false, next };
  const roundDone = steps.every((s) => s.round !== logged.round || s.done);
  return { rest: roundDone, next };
}

/** A superset rests after each round for as long as its longest member rest. */
export const groupRest = (rests: readonly number[]) => (rests.length ? Math.max(...rests) : 0);
