import { planCaravan, inventoryCounts } from "../src/planner/caravan";
import { arbitrageRows } from "../src/planner/arbitrage";
import { travelContext } from "../src/planner/travel";
import { saveIdentity, saveCache, cacheCraft } from "../src/state/runtime";
import { item, buy, world } from "./helpers";
import { variantKey } from "../src/catalogue/readWorld";
import { createFixture } from "../harness/fixture";
import { caravanDirections } from "../src/ui/Caravan";
import { overlayPosition } from "../src/state/overlayPosition";
test("a basket buys multiple goods before sharing one journey and its cost", () => {
  const x = item("X"),
    y = item("Y"),
    w = world(
      [x, y],
      [],
      [
        { ...buy("X", 20, 2, "x"), marketId: "A", stockItem: x.raw },
        { ...buy("Y", 20, 3, "y"), marketId: "A", stockItem: y.raw },
      ],
    );
  w.markets = [
    {
      id: "B",
      name: "B",
      availability: "available",
      bonus: 3,
      multiplier: 1,
      raw: {},
    },
  ];
  const rows = arbitrageRows(w);
  for (const r of rows)
    for (const a of r.alternatives) {
      a.sale = 30;
      a.profit = 10;
      a.quote.price = { state: "value", value: 30 };
    }
  const plan = planCaravan(w, rows, {
    cash: 100,
    current: "A",
    days: { A: { A: 0, B: 2 }, B: { A: 2, B: 0 } },
  });
  expect(plan.gain).toBe(50);
  expect(plan.days).toBe(2);
  expect(plan.gainPerDay).toBe(25);
  expect(plan.endCash).toBe(150);
  const steps = caravanDirections(plan);
  expect(steps.filter((s) => s.startsWith("Travel"))).toHaveLength(1);
  expect(steps[0]).toMatch(/^Buy/);
  expect(steps[1]).toMatch(/^Buy/);
  expect(steps[2]).toMatch(/^Travel/);
});
test("different acquisition lots retain the cost of the stock actually purchased", () => {
  const i = item("Ore"),
    cheap = {
      ...buy("Ore", 10, 2, "cheap"),
      marketId: "market",
      stockItem: i.raw,
    },
    dear = {
      ...buy("Ore", 20, 2, "dear"),
      marketId: "market",
      stockItem: i.raw,
    };
  const w = world([i], [], [cheap, dear]),
    travel = { cash: 100, current: "market", days: { market: { market: 0 } } };
  const first = planCaravan(w, arbitrageRows(w), travel);
  cheap.quantity = 1;
  const key = variantKey(i.raw);
  w.inventory = [
    {
      key,
      name: i.name,
      label: i.label,
      quantity: 1,
      place: "inventory",
      raw: i.raw,
    },
  ];
  const second = planCaravan(
    w,
    arbitrageRows(w),
    { ...travel, cash: 90 },
    8,
    first,
  );
  expect(second.lots[key].map((l) => [l.quantity, l.cost])).toEqual([[1, 10]]);
  dear.quantity = 1;
  w.inventory[0].quantity = 2;
  const third = planCaravan(
    w,
    arbitrageRows(w),
    { ...travel, cash: 70 },
    8,
    second,
  );
  expect(third.lots[key].map((l) => [l.quantity, l.cost])).toEqual([
    [1, 10],
    [1, 20],
  ]);
  w.inventory[0].quantity = 1;
  const fourth = planCaravan(
    w,
    arbitrageRows(w),
    { ...travel, cash: 100 },
    8,
    third,
  );
  expect(fourth.lots[key].map((l) => [l.quantity, l.cost])).toEqual([[1, 20]]);
});
test("overlay avoids a launcher beside its top-right controls", () => {
  const position = overlayPosition(
    { x: 620, y: 88 },
    { width: 704, height: 884 },
    180,
  );
  expect(position).toEqual({ x: 16, y: 96 });
});
test("caravan respects cash and shared stock, and selects highest gain per day", () => {
  const i = item("Ore");
  const w = world(
    [i],
    [],
    [{ ...buy("Ore", 10, 5, "stock"), marketId: "A", stockItem: i.raw }],
  );
  w.markets = [
    {
      id: "A",
      name: "A",
      availability: "available",
      bonus: 0,
      multiplier: 1,
      raw: {},
    },
    {
      id: "B",
      name: "B",
      availability: "available",
      bonus: 3,
      multiplier: 1,
      raw: {},
    },
    {
      id: "C",
      name: "C",
      availability: "available",
      bonus: 6,
      multiplier: 1,
      raw: {},
    },
  ];
  const rows = arbitrageRows(w);
  rows.forEach((r) => {
    r.alternatives = r.alternatives.filter((a) => a.quote.marketId !== "A");
  });
  const travel = {
    cash: 35,
    current: "A",
    days: {
      A: { A: 0, B: 1, C: 10 },
      B: { A: 1, B: 0, C: 9 },
      C: { A: 10, B: 9, C: 0 },
    },
  };
  const plan = planCaravan(w, rows, travel, 8);
  expect(plan.trades[0].sellId).toBe("B");
  expect(plan.trades[0].quantity).toBe(3);
  expect(plan.trades.reduce((s, t) => s + t.quantity, 0)).toBeLessThanOrEqual(
    5,
  );
  let balance = 35;
  for (const t of plan.trades) {
    expect(t.quantity * t.cost).toBeLessThanOrEqual(balance);
    balance += t.quantity * (t.sale - t.cost);
  }
  expect(plan.endCash).toBeCloseTo(balance);
  expect(plan.gainPerDay).toBeCloseTo(plan.gain / plan.days);
});
test("unknown routes are excluded and carried purchases survive an auto-update", () => {
  const i = item("Ore"),
    w = world(
      [i],
      [],
      [{ ...buy("Ore", 1, 3, "stock"), marketId: "market", stockItem: i.raw }],
    );
  const travel = {
    cash: 10,
    current: "market",
    days: { market: { market: 0 } },
  };
  const first = planCaravan(w, arbitrageRows(w), travel);
  expect(first.trades.length).toBeGreaterThan(0);
  w.sources.clear();
  w.inventory = [
    {
      key: variantKey(i.raw),
      name: i.name,
      label: i.label,
      quantity: 2,
      place: "inventory",
      raw: i.raw,
    },
  ];
  const updated = planCaravan(w, [], { ...travel, cash: 8 }, 8, first);
  expect(updated.trades[0]).toMatchObject({
    carried: true,
    quantity: 2,
    cost: 0,
  });
  expect(updated.gainPerDay).toBeNull();
  expect(inventoryCounts(w)[variantKey(i.raw)]).toBe(2);
  expect(planCaravan(w, [], { ...travel, days: {} }, 8, first).trades).toEqual(
    [],
  );
});
test("travel days follow native direct preference and round shortest total once", () => {
  const f = createFixture();
  f.api.utils.discoverUnlockedLocations = (_, out) =>
    out.push(
      { name: "A", unlocks: [{ location: { name: "B" }, distance: 1.2 }] },
      { name: "B", unlocks: [{ location: { name: "C" }, distance: 1.2 }] },
      { name: "C", unlocks: [] },
    );
  f.api.utils.getMoveSpeedMultiplier = () => 1;
  const w = world([]);
  w.markets = [
    ...["A", "B", "C"].map((id) => ({ ...w.markets[0], id, name: id })),
  ];
  const result = travelContext(
    f.api,
    {
      inventory: { money: 100 },
      location: { current: "A" },
      player: { player: {} },
      breakthrough: {},
    },
    {},
    w,
  );
  expect(result.days.A.C).toBe(3);
  expect(result.days.C.A).toBe(3);
  expect(result.days.A.B).toBe(2);
  expect(travelContext(f.api, { inventory: {} }, {}, w).reason).toContain(
    "balance",
  );
});
test("auto-update never mistakes proceeds from purchased cargo for profit", () => {
  const i = item("Ore"),
    w = world(
      [i],
      [],
      [{ ...buy("Ore", 40, 1, "stock"), marketId: "A", stockItem: i.raw }],
    );
  w.markets = [
    {
      id: "A",
      name: "A",
      availability: "available",
      bonus: 0,
      multiplier: 1,
      raw: {},
    },
    {
      id: "B",
      name: "B",
      availability: "available",
      bonus: 4,
      multiplier: 1,
      raw: {},
    },
  ];
  const travel = {
    cash: 100,
    current: "A",
    days: { A: { A: 0, B: 2 }, B: { A: 2, B: 0 } },
  };
  const first = planCaravan(w, arbitrageRows(w), travel);
  expect(first.trades[0].sellId).toBe("B");
  w.sources.clear();
  w.inventory = [
    {
      key: variantKey(i.raw),
      name: i.name,
      label: i.label,
      quantity: 1,
      place: "inventory",
      raw: i.raw,
    },
  ];
  const next = planCaravan(w, [], { ...travel, cash: 60 }, 8, first);
  expect(next.trades[0].sellId).toBe("B");
  expect(next.trades[0].carried).toBe(true);
  expect(next.gain).toBe(next.trades[0].sale - 40);
  expect(next.endCash).toBe(60 + next.trades[0].sale);
});
test("cache is isolated by save creation identity, not just character name", () => {
  const a = {
      newGame: { createdAt: 1 },
      player: { player: { forename: "Same" } },
    },
    b = { ...a, newGame: { createdAt: 2 } };
  const ca = saveCache(saveIdentity(a)),
    cb = saveCache(saveIdentity(b));
  cacheCraft(ca, "query", []);
  expect(saveCache(saveIdentity(a))).toBe(ca);
  expect(cb.craft.has("query")).toBe(false);
  expect(saveIdentity({ player: a.player })).toBeUndefined();
  expect(saveCache()).not.toBe(saveCache());
});
