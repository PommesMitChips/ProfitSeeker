import {
  marketCatalogue,
  purchaseListings,
  purchaseMetric,
} from "../src/query/marketCatalogue";
import { selectMarkets } from "../src/query/markets";
import { evaluateRow } from "../src/planner/engine";
import { arbitrageRows } from "../src/planner/arbitrage";
import { defaults } from "../src/domain/model";
import { groupedReturns, MarketDetails } from "../src/ui/MarketDetails";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { item, buy, recipe, world } from "./helpers";
import { createFixture } from "../harness/fixture";
import { RecipeReader } from "../src/game/api";
import { readWorld } from "../src/catalogue/readWorld";

function markets() {
  const herb = item("Herb"),
    ore = item("Ore"),
    pill = item("Insight Pill+", { kind: "pill" }),
    r = recipe("Insight recipe", pill, [{ name: "Herb", quantity: 2 }], 5);
  const w = world(
    [herb, ore, pill],
    [r],
    [
      {
        ...buy("Herb", 33, 10, "garden-herb"),
        marketId: "garden",
        location: "Garden",
        label: "Garden",
      },
      { ...buy("Ore", 10, 4, "mine-ore"), marketId: "mine", location: "Mine" },
    ],
  );
  w.markets = ["garden", "mine"].map((id) => ({
    id,
    name: id === "garden" ? "Garden" : "Mine",
    known: true,
    availability: "available" as const,
    bonus: 0,
    multiplier: 1,
    raw: {},
  }));
  return { w, herb, ore, pill };
}
test("market catalogue contains only actual item listings; selling a pill does not create purchase stock", () => {
  const { w, herb, pill } = markets(),
    p = defaults();
  p.options.inventory = false;
  expect(
    marketCatalogue(w)
      .byMarket.get("mine")
      ?.map((s) => s.item),
  ).toEqual(["Ore"]);
  expect(purchaseListings(w, herb.name).map((s) => s.marketId)).toEqual([
    "garden",
  ]);
  const row = evaluateRow(pill, w, p);
  expect(row.buy.state).toBe("unavailable");
  expect(row.purchases).toEqual([]);
  expect(row.quotes.map((q) => q.marketId)).toEqual(["garden", "mine"]);
  expect(row.quotes.every((q) => q.price.state === "value")).toBe(true);
  expect(
    row.route?.steps.filter((s) => s.kind === "buy").map((s) => s.label),
  ).toEqual(["Garden"]);
  expect(arbitrageRows(w).map((r) => r.item.name)).not.toContain(pill.name);
  expect(evaluateRow(herb, w, p).buy).toEqual({ state: "value", value: 33 });
});
test("stock zero, locked entries and unknown pools never become a confirmed purchase price", () => {
  const empty = buy("Herb", 1, 0),
    locked = { ...buy("Herb", 2), availability: "locked" as const },
    unknown = {
      ...buy("Herb", 3),
      availability: "unknown" as const,
      quantity: undefined,
    };
  expect(purchaseMetric([empty, locked]).state).toBe("unavailable");
  expect(purchaseMetric([empty, unknown]).state).toBe("unknown");
  expect(purchaseMetric([empty, locked, unknown, buy("Herb", 33, 2)])).toEqual({
    state: "value",
    value: 33,
  });
});
test("an unknown price preserves observed stock and a sale-only row still marks its headline quote", () => {
  const { w, herb } = markets();
  w.sources.get(herb.name)![0].cost = {
    state: "unknown",
    reason: "Price unresolved",
  };
  const row = evaluateRow(herb, w, defaults());
  expect(row.buy.state).toBe("unknown");
  expect(row.alternatives).toHaveLength(0);
  const html = renderToStaticMarkup(
    React.createElement(MarketDetails, { row }),
  );
  expect(html).toContain("Unknown");
  expect(html).not.toContain("Out of stock.");
  expect(html).toMatch(/>10<\/td>/);
  expect(html).toContain("Used in table");
});
test("market selection filters catalogue, buy reference price, ingredient sourcing and arbitrage together", () => {
  const { w, herb, pill } = markets(),
    scoped = selectMarkets(w, ["mine"]);
  expect(purchaseListings(scoped, herb.name)).toEqual([]);
  expect(evaluateRow(herb, scoped, defaults()).buy.state).toBe("unavailable");
  expect(evaluateRow(pill, scoped, defaults()).cost.state).toBe("unavailable");
  expect(arbitrageRows(scoped).map((r) => r.item.name)).toEqual(["Ore"]);
});
test("buy reference does not substitute a different star variant", () => {
  const { w, ore } = markets();
  w.sources.get(ore.name)![0].stockItem = {
    ...ore.raw,
    harmonyAugment: { type: "forge", quality: 3 },
  };
  expect(evaluateRow(ore, w, defaults()).buy.state).toBe("unavailable");
  expect(arbitrageRows(w).find((r) => r.item.name === "Ore")?.buy.state).toBe(
    "value",
  );
});
test("duplicate market buildings and equivalent recipe routes do not repeat identical rows", () => {
  const f = createFixture(),
    loc = f.api.gameData.locations as Record<string, any>;
  loc["Valley market"].buildings.push({ ...loc["Valley market"].buildings[1] });
  const reader = new RecipeReader(f.api),
    w = readWorld(f.api, f.getState(), f.flags, reader, 1);
  reader.dispose();
  expect(w.markets.filter((m) => m.id === "Valley market")).toHaveLength(1);
  const { w: base, pill } = markets(),
    row = evaluateRow(pill, base, defaults());
  expect(
    groupedReturns([
      ...row.alternatives,
      ...row.alternatives.map((a) => ({
        ...a,
        route: { ...a.route, id: "other-id" },
      })),
    ]),
  ).toHaveLength(1);
  expect(groupedReturns(row.alternatives)[0]).toHaveLength(2);
});
