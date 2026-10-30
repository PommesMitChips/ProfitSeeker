import { defaults, Metric, Row } from "../src/domain/model";
import {
  clampPage,
  matchScore,
  sortRows,
  visibleItems,
} from "../src/query/query";
test("shrinking results use the same valid page for pagination and row slicing", () => {
  const rows = Array.from({ length: 12 }, (_, i) => i);
  const page = clampPage(3, rows.length);
  expect(page).toBe(0);
  expect(rows.slice(page * 40, page * 40 + 40)).toHaveLength(12);
  expect(clampPage(3, 0)).toBe(0);
  expect(clampPage(3, 81)).toBe(2);
});
import { item, recipe, world } from "./helpers";
test("craftable filter requires a discovered recipe, independently of knowledge and calculator eligibility", () => {
  const material = item("Material"),
    known = item("Known output"),
    unknown = item("Unknown output");
  const r1 = recipe("Known recipe", known, []),
    r2 = recipe("Unknown recipe", unknown, []);
  r2.known = false;
  const w = world([material, known, unknown], [r1, r2]),
    prefs = defaults();
  prefs.filters.known = false;
  expect(visibleItems(w, prefs).map((i) => i.name)).toEqual([
    "Material",
    "Known output",
    "Unknown output",
  ]);
  prefs.filters.craftable = true;
  prefs.options = {
    ...prefs.options,
    tier: "sublime",
    quality: 21,
    buy: false,
    farm: false,
    inventory: false,
  };
  expect(visibleItems(w, prefs).map((i) => i.name)).toEqual([
    "Known output",
    "Unknown output",
  ]);
  prefs.filters.known = true;
  expect(visibleItems(w, prefs).map((i) => i.name)).toEqual(["Known output"]);
  w.recipesByOutput.set(material.name, []);
  expect(visibleItems(w, prefs).map((i) => i.name)).toEqual(["Known output"]);
});
test("calculator options do not affect row membership", () => {
  const a = item("A"),
    b = item("B"),
    r = recipe("Recipe", b, [{ name: "A", quantity: 2 }]),
    w = world([a, b], [r]),
    prefs = defaults();
  const expected = visibleItems(w, prefs).map((i) => i.key);
  for (const tier of ["basic", "perfect", "sublime"] as const)
    for (const buy of [true, false])
      for (const farm of [true, false])
        for (const inventory of [true, false])
          expect(
            visibleItems(w, {
              ...prefs,
              options: { tier, quality: 9, buy, farm, inventory },
            }).map((i) => i.key),
          ).toEqual(expected);
});
test("keywords use OR matching, distinct coverage and field weighting", () => {
  const a = item("Moon Pill"),
    b = item("Ore");
  b.description = "Moon mine";
  const w = world([a, b]);
  expect(matchScore(a, w, "moon moon")).toEqual(matchScore(a, w, "moon"));
  expect(matchScore(b, w, "moon mine")[0]).toBe(2);
  const prefs = defaults();
  prefs.filters.search = "moon missing";
  expect(visibleItems(w, prefs)).toHaveLength(2);
  expect(matchScore(a, w, "moon")[1]).toBeGreaterThan(
    matchScore(b, w, "moon")[1],
  );
});
test("missing values sort last in both directions for every numeric column", () => {
  const make = (name: string, metric: Metric) =>
    ({
      item: item(name),
      cost: metric,
      buy: metric,
      sale: metric,
      profit: metric,
      roi: metric,
      quotes: [],
      alternatives: [],
      complete: true,
    }) as Row;
  const rows = [
    make("unknown", { state: "unknown", reason: "missing" }),
    make("low", { state: "value", value: 1 }),
    make("high", { state: "value", value: 4 }),
  ];
  for (const key of ["cost", "sale", "profit", "roi"] as const) {
    expect(sortRows(rows, key, false).map((r) => r.item.name)).toEqual([
      "low",
      "high",
      "unknown",
    ]);
    expect(sortRows(rows, key, true).map((r) => r.item.name)).toEqual([
      "high",
      "low",
      "unknown",
    ]);
  }
});
