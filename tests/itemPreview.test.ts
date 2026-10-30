import {
  acquisitionSources,
  instantYieldLabel,
} from "../src/query/itemPreview";
import { resolveOutput } from "../src/mechanics/results";
import { buy, item, recipe, world } from "./helpers";

test("hover reports actual repeat range independently of a planned star override", () => {
  const output = item("Extractor", {
    kind: "ore_extractor",
    upgradeHarmonies: { forge: true },
  });
  const r = recipe("Extractor recipe", output, []);
  r.outputs.sublime = r.outputs.perfect;
  r.record.sublimeCount = 1;
  r.record.sublimeBestResult = 464;
  const w = world([output], [r]);
  expect(resolveOutput(r, "sublime", 20, w)?.quality).toBe(20);
  expect(instantYieldLabel(output, r, "sublime", w)).toBe(
    "Yield: 1 at Sublime · 1–2 stars",
  );
});

test("hover distinguishes repeat quantity from manual-only and mismatched result items", () => {
  const output = item("Pill", { kind: "pill" });
  const r = recipe("Pill recipe", output, [], 10);
  r.record.perfectBestResult = 295;
  const w = world([output], [r]);
  expect(instantYieldLabel(output, r, "perfect", w)).toBe(
    "Yield: 12–14 at Perfect",
  );
  r.known = false;
  expect(instantYieldLabel(output, r, "perfect", w)).toBe(
    "Yield: — (instant crafting unavailable)",
  );
  r.outputs.perfect!.name = "Perfect pill";
  expect(instantYieldLabel(output, r, "perfect", w)).toBe(
    "Yield: — (instant crafting unavailable)",
  );
});

test("acquisition looks up the recipe, excludes crafting-output records and deduplicates locations", () => {
  const output = item("Pill");
  const r = recipe("Pill recipe", output, []);
  const source = buy(r.name, 100, 1, "Valley library");
  const w = world(
    [output],
    [r],
    [
      source,
      { ...source, id: "duplicate" },
      buy(output.name, 10, 1, "Output market"),
    ],
  );
  expect(acquisitionSources(w, output, r)).toEqual([source]);
  w.sources.delete(r.name);
  expect(acquisitionSources(w, output, r)).toEqual([]);
});
