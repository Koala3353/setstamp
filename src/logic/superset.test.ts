import { describe, expect, it } from "vitest";
import {
  afterLog,
  blockAt,
  canMove,
  groupOf,
  groupRest,
  linkWithNext,
  moveItem,
  moveTo,
  nextInGroup,
  normalizeGroups,
  removeAt,
  supersetRuns,
  unlink,
  type RoundMember,
} from "./superset";

type It = { id: string; groupId?: string | null };
const items = (spec: string): It[] =>
  // "a b:g c:g d" -> ids with optional group
  spec.split(" ").map((t) => {
    const [id, g] = t.split(":");
    return g ? { id: id!, groupId: g } : { id: id! };
  });
const show = (xs: It[]) => xs.map((x) => (groupOf(x) ? `${x.id}:${x.groupId}` : x.id)).join(" ");

describe("superset groups", () => {
  it("treats a missing groupId (older rows) as ungrouped", () => {
    expect(groupOf({})).toBeNull();
    expect(supersetRuns(items("a b c"))).toEqual([]);
  });

  it("links an item with the next one", () => {
    expect(show(linkWithNext(items("a b c"), 0, "g"))).toBe("a:g b:g c");
    // joining an existing group keeps its id
    expect(show(linkWithNext(items("a:x b:x c"), 1, "g"))).toBe("a:x b:x c:x");
    expect(show(linkWithNext(items("a b:x c:x"), 0, "g"))).toBe("a:x b:x c:x");
    // two groups merge
    expect(show(linkWithNext(items("a:x b:x c:y d:y"), 1, "g"))).toBe("a:x b:x c:x d:x");
    // nothing after the last item
    expect(show(linkWithNext(items("a b"), 1, "g"))).toBe("a b");
  });

  it("unlinks: an end member steps out in place, a middle member moves after the group", () => {
    expect(show(unlink(items("a:g b:g c:g d"), 0))).toBe("a b:g c:g d");
    expect(show(unlink(items("a:g b:g c:g d"), 2))).toBe("a:g b:g c d");
    expect(show(unlink(items("a:g b:g c:g d"), 1))).toBe("a:g c:g b d");
  });

  it("dissolves a group left with one member", () => {
    expect(show(unlink(items("a:g b:g c"), 0))).toBe("a b c");
    expect(show(removeAt(items("a:g b:g c"), 1))).toBe("a c");
    expect(show(removeAt(items("a:g b:g c:g"), 1))).toBe("a:g c:g");
    expect(show(normalizeGroups(items("a:g b c:g")))).toBe("a b c");
  });

  it("keeps a group contiguous when data arrives split", () => {
    expect(show(normalizeGroups(items("a:g b:g c d:g e:g")))).toBe("a:g b:g c d e");
  });

  it("moves inside a group, and moves whole blocks across groups", () => {
    expect(show(moveItem(items("a:g b:g c"), 0, 1)!)).toBe("b:g a:g c");
    // ungrouped item jumps over a whole superset
    expect(show(moveItem(items("a:g b:g c"), 2, -1)!)).toBe("c a:g b:g");
    // a group's edge member carries the whole group past its neighbour
    expect(show(moveItem(items("x a:g b:g c"), 1, -1)!)).toBe("a:g b:g x c");
    expect(show(moveItem(items("x a:g b:g c"), 2, 1)!)).toBe("x c a:g b:g");
    // two supersets swap
    expect(show(moveItem(items("a:g b:g c:h d:h"), 1, 1)!)).toBe("c:h d:h a:g b:g");
    expect(moveItem(items("a b"), 0, -1)).toBeNull();
    expect(canMove(items("a:g b:g"), 0, 1)).toBe(true);
    expect(canMove(items("a:g b:g"), 1, 1)).toBe(false);
  });

  it("finds blocks and labels runs A, B…", () => {
    const xs = items("a:g b:g c d:h e:h");
    expect(blockAt(xs, 1)).toEqual([0, 1]);
    expect(blockAt(xs, 2)).toEqual([2, 2]);
    expect(supersetRuns(xs).map((r) => `${r.label}:${r.start}-${r.end}`)).toEqual(["A:0-1", "B:3-4"]);
  });
});

describe("superset rounds", () => {
  const set = (cid: string, done = false, kind: "warmup" | "working" = "working") => ({ cid, kind, done });
  const pair = (bench: ReturnType<typeof set>[], row: ReturnType<typeof set>[]): RoundMember[] => [
    { key: "bench", sets: bench },
    { key: "row", sets: row },
  ];

  it("orders warm-ups first, then round by round", () => {
    const m = pair([set("bw", false, "warmup"), set("b1"), set("b2")], [set("r1"), set("r2")]);
    expect(nextInGroup(m)).toBe("bw");
    const m2 = pair([set("b1", true), set("b2")], [set("r1"), set("r2")]);
    expect(nextInGroup(m2)).toBe("r1");
  });

  it("jumps to the next exercise for the same set number, no rest mid-round", () => {
    const m = pair([set("b1"), set("b2")], [set("r1"), set("r2")]);
    expect(afterLog(m, "b1")).toEqual({ rest: false, next: "r1" });
  });

  it("starts rest after the last exercise of the round", () => {
    const m = pair([set("b1", true), set("b2")], [set("r1"), set("r2")]);
    expect(afterLog(m, "r1")).toEqual({ rest: true, next: "b2" });
  });

  it("rests when the round completes even if ticked out of order", () => {
    const m = pair([set("b1"), set("b2")], [set("r1", true), set("r2")]);
    expect(afterLog(m, "b1")).toEqual({ rest: true, next: "b2" });
  });

  it("a member with fewer sets drops out of later rounds", () => {
    const m = pair([set("b1", true), set("b2", true), set("b3")], [set("r1", true), set("r2", true)]);
    expect(afterLog(m, "b3")).toEqual({ rest: true, next: null });
  });

  it("warm-ups never start rest", () => {
    const m = pair([set("bw", false, "warmup"), set("b1")], [set("r1")]);
    expect(afterLog(m, "bw").rest).toBe(false);
  });

  it("a single exercise rests after every working set", () => {
    expect(afterLog([{ key: "a", sets: [set("a1"), set("a2")] }], "a1")).toEqual({ rest: true, next: "a2" });
  });

  it("group rest is the longest member rest", () => {
    expect(groupRest([90, 150, 60])).toBe(150);
    expect(groupRest([])).toBe(0);
  });
});

describe("moveTo (drag and drop)", () => {
  const mv = (spec: string, from: number, to: number) => {
    const r = moveTo(items(spec), from, to);
    return r === null ? null : show(r);
  };

  it("moves ungrouped items like an array move", () => {
    expect(mv("a b c d", 0, 2)).toBe("b c a d");
    expect(mv("a b c d", 3, 0)).toBe("d a b c");
    expect(mv("a b c d", 1, 3)).toBe("a c d b");
  });

  it("returns null for no-ops and bad input", () => {
    expect(mv("a b c", 1, 1)).toBeNull();
    expect(mv("a", 0, 0)).toBeNull();
    expect(mv("a b", 5, 0)).toBeNull();
    expect(mv("a b", -1, 0)).toBeNull();
    expect(moveTo([], 0, 0)).toBeNull();
  });

  it("clamps the target to the list", () => {
    expect(mv("a b c", 0, 99)).toBe("b c a");
    expect(mv("a b c", 2, -4)).toBe("c a b");
  });

  it("reorders inside a superset when dropped inside it", () => {
    expect(mv("a b:g c:g d:g e", 1, 3)).toBe("a c:g d:g b:g e");
    expect(mv("a b:g c:g d:g e", 3, 1)).toBe("a d:g b:g c:g e");
    expect(mv("a:g b:g", 0, 1)).toBe("b:g a:g");
  });

  it("moves the whole superset when a member is dropped outside it", () => {
    // first member dragged to the end
    expect(mv("a:g b:g c d", 0, 3)).toBe("c d a:g b:g");
    // last member dragged above everything
    expect(mv("a b c:g d:g", 3, 0)).toBe("c:g d:g a b");
    // a middle member dragged down one past the block
    expect(mv("x a:g b:g c:g y z", 2, 4)).toBe("x y a:g b:g c:g z");
    // a member dragged up past one item
    expect(mv("x y a:g b:g", 3, 1)).toBe("x a:g b:g y");
  });

  it("never splits a superset it is dropped into", () => {
    // ungrouped item dragged into a pair: passing one of two members jumps the pair
    expect(mv("a b:g c:g d", 0, 1)).toBe("b:g c:g a d");
    expect(mv("a b:g c:g d", 3, 2)).toBe("a d b:g c:g");
    // a three-member superset: passing one stays above, passing two jumps below
    expect(mv("a b:g c:g d:g", 0, 1)).toBeNull();
    expect(mv("a b:g c:g d:g", 0, 2)).toBe("b:g c:g d:g a");
    expect(mv("b:g c:g d:g a", 3, 2)).toBeNull();
    expect(mv("b:g c:g d:g a", 3, 1)).toBe("a b:g c:g d:g");
    // a superset dragged into another superset
    expect(mv("a:x b:x c:y d:y", 0, 2)).toBe("c:y d:y a:x b:x");
    expect(mv("a:x b:x c:y d:y", 3, 1)).toBe("c:y d:y a:x b:x");
    // every result keeps groups contiguous
    const spec = "a b:g c:g d e:h f:h g:h i";
    for (let f = 0; f < 9; f++)
      for (let t = 0; t < 9; t++) {
        const r = moveTo(items(spec), f, t);
        if (r) expect(normalizeGroups(r)).toEqual(r);
      }
  });

  it("agrees with moveItem for single steps", () => {
    const spec = "a b:g c:g d e:h f:h g";
    for (let i = 0; i < 7; i++) {
      const [s, e] = blockAt(items(spec), i);
      const down = moveItem(items(spec), i, 1);
      if (down && e === i) {
        // the next block's size decides how far a whole-block step lands
        const [, d] = blockAt(items(spec), e + 1);
        expect(moveTo(items(spec), i, i + (d - e))).toEqual(down);
      }
      const up = moveItem(items(spec), i, -1);
      if (up && s === i) {
        const [c] = blockAt(items(spec), s - 1);
        expect(moveTo(items(spec), i, i - (s - c))).toEqual(up);
      }
    }
  });
});
