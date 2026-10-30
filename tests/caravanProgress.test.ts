import {
  bindCaravanOrders,
  caravanStops,
  observeCaravanProgress,
  orderExpectedProfit,
} from "../src/planner/caravanProgress";
import { CaravanPlan, CaravanTrade } from "../src/planner/caravan";
import { arbitrageRows } from "../src/planner/arbitrage";
import { salePrice } from "../src/mechanics/pricing";
import { item, buy, world } from "./helpers";

function setup() {
  const x = item("X"),
    y = item("Y"),
    sx = { ...buy("X", 10, 2, "x"), marketId: "A", stockItem: x.raw },
    sy = { ...buy("Y", 20, 3, "y"), marketId: "A", stockItem: y.raw };
  const w = world([x, y], [], [sx, sy]);
  w.markets = [
    { ...w.markets[0], id: "A", name: "A" },
    { ...w.markets[0], id: "B", name: "B" },
  ];
  const trades: CaravanTrade[] = [
    {
      item: "X",
      itemName: "X",
      key: "X",
      quantity: 2,
      buyAt: "A",
      buyId: "A",
      sellAt: "B",
      sellId: "B",
      sourceId: "x",
      group: "one",
      cost: 10,
      basis: 10,
      sale: 30,
      toBuyDays: 0,
      toSellDays: 2,
      cashAfter: 170,
      carried: false,
    },
    {
      item: "Y",
      key: "Y",
      quantity: 3,
      buyAt: "A",
      buyId: "A",
      sellAt: "B",
      sellId: "B",
      sourceId: "y",
      group: "one",
      cost: 20,
      basis: 20,
      sale: 30,
      toBuyDays: 0,
      toSellDays: 0,
      cashAfter: 170,
      carried: false,
    },
  ];
  const qx = salePrice(x, w.markets[1]),
    qy = salePrice(y, w.markets[1]);
  const px = qx.state === "value" ? qx.value : 0,
    py = qy.state === "value" ? qy.value : 0;
  trades[0].sale = px;
  trades[1].sale = py;
  let plan = bindCaravanOrders({
    trades,
    startCash: 100,
    endCash: 170,
    days: 2,
    gain: 70,
    gainPerDay: 35,
    current: "A",
    baseline: {},
    tracked: [x, y],
    lots: {},
    observedInventory: {},
    observedOffers: {
      x: { key: "X", quantity: 2, cost: 10 },
      y: { key: "Y", quantity: 3, cost: 20 },
    },
    limited: false,
    createdAt: 1,
  } as CaravanPlan);
  const observe = (cash: number, current = "A") =>
    (plan = observeCaravanProgress(plan, w, arbitrageRows(w), {
      cash,
      current,
      days: {},
    }));
  const inventory = (nx: number, ny: number) => {
    w.inventory = [
      {
        key: "X",
        name: "X",
        label: "X",
        quantity: nx,
        place: "inventory",
        raw: x.raw,
      },
      {
        key: "Y",
        name: "Y",
        label: "Y",
        quantity: ny,
        place: "inventory",
        raw: y.raw,
      },
    ];
  };
  return {
    w,
    sx,
    sy,
    px,
    py,
    observe,
    inventory,
    get plan() {
      return plan;
    },
  };
}
test("one stop contains the whole purchase basket and the next contains all sales", () => {
  const f = setup(),
    stops = caravanStops(f.plan);
  expect(stops.map((s) => [s.location, s.orders.map((o) => o.action)])).toEqual(
    [
      ["A", ["buy", "buy"]],
      ["B", ["sell", "sell"]],
    ],
  );
  expect(stops[1].days).toBe(2);
  expect(f.plan.progress!.orders.map(orderExpectedProfit)).toEqual([
    2 * (f.px - 10),
    3 * (f.py - 20),
  ]);
  // Returning to A is a separate visit, not globally collapsed by market ID.
  const again = bindCaravanOrders(
    {
      ...f.plan,
      trades: [...f.plan.trades, { ...f.plan.trades[0], group: "two" }],
    },
    undefined,
  );
  expect(caravanStops(again).map((s) => s.location)).toEqual([
    "A",
    "B",
    "A",
    "B",
  ]);
});
test("partial and batched sales credit actual margin once, survive serialization, and never count purchase cash as profit", () => {
  const f = setup();
  f.sx.quantity = 0;
  f.sy.quantity = 0;
  f.inventory(2, 3);
  let plan = f.observe(20);
  expect(plan.progress!.orders.map((o) => [o.bought, o.gained])).toEqual([
    [2, 0],
    [3, 0],
  ]);
  f.inventory(1, 3);
  plan = f.observe(20 + f.px, "B");
  expect(plan.progress!.orders[0]).toMatchObject({
    sold: 1,
    gained: f.px - 10,
    uncertain: false,
  });
  f.inventory(0, 0);
  plan = f.observe(20 + 2 * f.px + 3 * f.py, "B");
  expect(plan.progress!.orders.map((o) => [o.sold, o.gained])).toEqual([
    [2, 2 * (f.px - 10)],
    [3, 3 * (f.py - 20)],
  ]);
  expect(f.observe(20 + 2 * f.px + 3 * f.py, "B")).toBe(plan);
  const saved = JSON.parse(JSON.stringify(plan));
  expect(
    observeCaravanProgress(saved, f.w, arbitrageRows(f.w), {
      cash: 20 + 2 * f.px + 3 * f.py,
      current: "B",
      days: {},
    }),
  ).toBe(saved);
  const refreshed = bindCaravanOrders(
    { ...plan, trades: [], gain: 0 },
    plan.progress,
  );
  expect(refreshed.progress!.orders.reduce((n, o) => n + o.gained, 0)).toBe(
    2 * (f.px - 10) + 3 * (f.py - 20),
  );
  expect(caravanStops(refreshed)[0].orders).toHaveLength(2);
});
test("an unexplained inventory loss or unrelated cash change is not claimed as gained profit", () => {
  const f = setup();
  f.sx.quantity = 0;
  f.inventory(2, 0);
  f.observe(80);
  f.inventory(1, 0);
  const plan = f.observe(80, "B");
  expect(plan.progress!.orders[0]).toMatchObject({
    sold: 0,
    gained: 0,
    removed: 1,
    uncertain: true,
  });
  f.inventory(0, 0);
  expect(f.observe(115, "B").progress!.orders[0].gained).toBe(0);
});
test("replanning carried orders retains acquisition cost and completed profit", () => {
  const f = setup();
  f.sx.quantity = 0;
  f.inventory(2, 0);
  let plan = f.observe(80);
  f.inventory(1, 0);
  plan = f.observe(80 + f.px, "B");
  const refreshed = bindCaravanOrders(
    {
      ...plan,
      trades: [
        {
          ...plan.trades[0],
          buyId: undefined,
          buyAt: undefined,
          carried: true,
          cost: 0,
          basis: 10,
          quantity: 1,
        },
      ],
    },
    plan.progress,
  );
  expect(refreshed.trades[0].orderId).toBe(plan.trades[0].orderId);
  expect(refreshed.progress!.orders).toHaveLength(1);
  expect(orderExpectedProfit(refreshed.progress!.orders[0])).toBe(
    2 * (f.px - 10),
  );
  expect(refreshed.progress!.orders[0].gained).toBe(f.px - 10);
  expect(caravanStops(refreshed)[0].orders[0]).toMatchObject({
    quantity: 2,
    order: { sold: 1 },
  });
});
test("an unconfirmed later disposal preserves earlier confirmed gains", () => {
  const f = setup();
  f.sx.quantity = 0;
  f.inventory(2, 0);
  f.observe(80);
  f.inventory(1, 0);
  f.observe(80 + f.px, "B");
  f.inventory(0, 0);
  const plan = f.observe(80 + f.px, "B");
  expect(plan.progress!.orders[0]).toMatchObject({
    sold: 1,
    removed: 1,
    gained: f.px - 10,
    uncertain: true,
  });
});
