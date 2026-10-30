import priceVectors from "./fixtures/price-vectors.json";
import {
  BUY,
  SELL,
  nameFactor,
  purchasePrice,
  unitPrice,
} from "../src/mechanics/pricing";
import { bands, finance, resolveOutput } from "../src/mechanics/results";
import { item, recipe, world } from "./helpers";
import { Raw } from "../src/domain/model";
test("price and name factor agree with retained numeric reference vectors", () => {
  for (const [name, factor] of Object.entries(priceVectors.nameFactors))
    expect(nameFactor(name)).toBeCloseTo(factor, 13);
  for (const vector of priceVectors.vectors)
    expect(unitPrice(vector.item, SELL, priceVectors.multiplier, priceVectors.modifier, priceVectors.charisma)).toEqual({state:"value", value:vector.expected});
});
test("quality is linear, hidden potential is not a sale premium, and purchase has a floor", () => {
  const raw = item("Ore").raw;
  expect(unitPrice({ ...raw, hiddenPotential: 20 }, SELL, 1)).toEqual(
    unitPrice(raw, SELL, 1),
  );
  const market = {
    id: "x",
    name: "x",
    availability: "available" as const,
    bonus: 0.2,
    multiplier: 0.1,
    raw: {},
  };
  const cost = purchasePrice(raw, market, 1, 0.1),
    floor = unitPrice(raw, SELL, 1.2);
  expect(cost).toEqual(floor);
  expect(unitPrice({ ...raw, kind: "unsupported" }, BUY, 1).state).toBe(
    "unknown",
  );
});
test("achieved perfect uses the guaranteed lower yield and exposes the upper yield", () => {
  const product = item("Pill", { kind: "pill" }),
    r = recipe("Pill recipe", product, [], 10);
  r.record.perfectBestResult = 295;
  expect(bands(295, 100)).toMatchObject({ guaranteed: 2 });
  expect(
    resolveOutput(r, "perfect", "achieved", world([product], [r])),
  ).toMatchObject({
    quantity: 12,
    maxQuantity: 14,
    basis: "Achieved repeat yield",
  });
});
test("single-stack perfect disables the repeat quantity bonus", () => {
  const product = item("Pill", { kind: "pill" }),
    r = recipe("Recipe", product, [], 1);
  r.record.perfectBestResult = 700;
  expect(
    resolveOutput(r, "perfect", "achieved", world([product], [r]))?.quantity,
  ).toBe(1);
});
test("skill bypass uses base instant output, not an invented achievement", () => {
  const product = item("Pill"),
    r = recipe("Recipe", product, [], 5);
  r.record = {};
  r.raw._skillBypass = true;
  expect(
    resolveOutput(r, "perfect", "achieved", world([product], [r])),
  ).toMatchObject({
    quantity: 5,
    maxQuantity: 5,
    basis: "Base instant output",
  });
});
test("manual Sublime fallback exists but does not imply instant availability", () => {
  const product = item("Robe", { kind: "clothing" }),
    r = recipe("Robe recipe", product, []);
  r.record.sublimeCount = 1;
  expect(resolveOutput(r, "sublime", 3, world([product], [r]))).toMatchObject({
    instant: false,
    quality: 3,
    basis: "Planned quality",
  });
  expect(resolveOutput(r, "perfect", 3, world([product], [r]))).toBeUndefined();
});
test("ROI is profit over investment and zero investment remains undefined", () => {
  expect(finance(100, 150)).toEqual({ profit: 50, roi: 50 });
  expect(finance(0, 150)).toEqual({ profit: 150, roi: undefined });
  expect(finance(100, 50)).toEqual({ profit: -50, roi: -50 });
});
