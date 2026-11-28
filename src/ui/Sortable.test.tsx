import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { arrayMove, autoScrollSpeed, keyboardStep, SortHandle, sortPosition, targetIndex, useSortable } from "./Sortable";
import { moveTo } from "../logic/superset";

describe("sortable helpers", () => {
  it("array-moves", () => {
    expect(arrayMove(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(arrayMove(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(arrayMove(["a", "b"], 0, 9)).toEqual(["b", "a"]);
  });

  it("picks the target from the other items' midpoints", () => {
    const mids = [50, 150, 250]; // three other items
    expect(targetIndex(mids, 10)).toBe(0);
    expect(targetIndex(mids, 100)).toBe(1);
    expect(targetIndex(mids, 249)).toBe(2);
    expect(targetIndex(mids, 900)).toBe(3);
  });

  it("auto-scrolls only near the visible edges, faster closer in", () => {
    // header bottom at 64, dock top at 700
    expect(autoScrollSpeed(400, 64, 700)).toBe(0);
    expect(autoScrollSpeed(70, 64, 700)).toBeLessThan(0);
    expect(autoScrollSpeed(10, 64, 700)).toBe(-18);
    expect(autoScrollSpeed(690, 64, 700)).toBeGreaterThan(0);
    expect(autoScrollSpeed(650, 64, 700)).toBeLessThan(autoScrollSpeed(690, 64, 700));
  });

  it("keyboard steps skip targets that would not change the order", () => {
    // "a" above a three-member superset: one step down passes the whole superset at once.
    const items = [{ id: "a" }, { id: "b", groupId: "g" }, { id: "c", groupId: "g" }, { id: "d", groupId: "g" }];
    const keys = items.map((x) => x.id);
    const resolve = (f: number, t: number) => moveTo(items, f, t)?.map((x) => x.id) ?? keys;
    const down = keyboardStep(4, 0, 0, 1, keys, resolve);
    expect(down?.order).toEqual(["b", "c", "d", "a"]);
    expect(keyboardStep(4, 0, 0, -1, keys, resolve)).toBeNull();
    expect(keyboardStep(4, 0, down!.to, 1, down!.order, resolve)).toBeNull();
  });

  it("announces 1-based positions", () => {
    expect(sortPosition(["a", "b", "c"], "b")).toBe("position 2 of 3");
  });
});

function List({ names }: { names: string[] }) {
  const sort = useSortable({ keys: names, name: (k) => k, onCommit: () => {} });
  return (
    <>
      <ul className={sort.listClass("list")}>
        {sort.order.map((k) => (
          <li key={k} {...sort.item(k)}>
            <SortHandle bind={sort.handle(k)} />
            {k}
          </li>
        ))}
      </ul>
      {sort.live}
    </>
  );
}

describe("useSortable render", () => {
  const html = renderToStaticMarkup(<List names={["Bench Press", "Row"]} />);

  it("renders a labelled handle button described by the instructions", () => {
    expect(html).toContain('<button type="button" class="ui-sort-handle" aria-label="Reorder Bench Press" aria-describedby=');
    const id = /aria-describedby="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`id="${id}" class="sr-only">Press Space to pick up. Use the arrow keys to move, Space to drop, Escape to cancel.`);
  });

  it("gives items their visual order and an assertive live region", () => {
    expect(html).toContain('class="ui-sortable list"');
    expect(html).toMatch(/<li class="ui-sort-item" style="order:0" data-sort-key="Bench Press">/);
    expect(html).toMatch(/<li class="ui-sort-item" style="order:1" data-sort-key="Row">/);
    expect(html).toContain('role="status" aria-live="assertive"');
  });

  it("keeps UI copy free of em dashes", () => {
    expect(html).not.toContain("—");
  });
});
