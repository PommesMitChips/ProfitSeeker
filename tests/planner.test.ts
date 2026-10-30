import {
  Planner,
  canCraftNow,
  evaluateRow,
  usableInventory,
} from "../src/planner/engine";
import { defaults } from "../src/domain/model";
import { buy, item, recipe, world } from "./helpers";
test("the globally cheapest route preserves a shared ingredient for the expensive branch", () => {
  const x = item("X"),
    a = item("A"),
    b = item("B"),
    final = item("Final");
  const recipes = [
    recipe("A recipe", a, [{ name: "X", quantity: 1 }]),
    recipe("B recipe", b, [{ name: "X", quantity: 1 }]),
    recipe("Final recipe", final, [
      { name: "A", quantity: 1 },
      { name: "B", quantity: 1 },
    ]),
  ];
  const w = world([x, a, b, final], recipes, [buy("A", 5), buy("B", 100)]);
  w.inventory = [
    {
      key: "X",
      name: "X",
      label: "X",
      quantity: 1,
      place: "inventory",
      raw: {},
    },
  ];
  const planner = new Planner(w, defaults().options, true, {});
  const routes = planner.routes(final);
  expect(planner.limited).toBe(false);
  expect(routes[0].cost).toBe(5);
});
test("recipe branches cannot double-spend shared market stock", () => {
  const x = item("X"),
    a = item("A"),
    b = item("B"),
    f = item("Final");
  const w = world(
    [x, a, b, f],
    [
      recipe("A", a, [{ name: "X", quantity: 2 }]),
      recipe("B", b, [{ name: "X", quantity: 2 }]),
      recipe("Final", f, [
        { name: "A", quantity: 1 },
        { name: "B", quantity: 1 },
      ]),
    ],
    [buy("X", 3, 3)],
  );
  expect(new Planner(w, defaults().options, true, {}).routes(f)).toHaveLength(
    0,
  );
});
test("whole intermediate batches are paid for and surplus can supply a sibling", () => {
  const x = item("X"),
    a = item("A"),
    f = item("Final");
  const w = world(
    [x, a, f],
    [
      recipe("A", a, [{ name: "X", quantity: 2 }], 3),
      recipe("Final", f, [
        { name: "A", quantity: 4 },
        { name: "A", quantity: 2 },
      ]),
    ],
    [buy("X", 5)],
  );
  const plan = new Planner(w, defaults().options, true, {}).routes(f)[0];
  expect(plan.cost).toBe(20);
  expect(plan.steps.filter(s=>s.kind==='inventory')).toHaveLength(0);
  expect(plan.steps.filter(s=>s.kind==='intermediate').reduce((sum,s)=>sum+s.quantity,0)).toBe(6);
});
test("reservations are applied once across inventory and storage", () => {
  const w = world([item("X")]);
  w.inventory = [
    {
      key: "same",
      name: "X",
      label: "X",
      quantity: 2,
      place: "inventory",
      raw: {},
    },
    {
      key: "same",
      name: "X",
      label: "X",
      quantity: 3,
      place: "storage",
      raw: {},
    },
  ];
  expect(usableInventory(w, { same: 4 }).get("X")).toBe(1);
});
test("cyclic recipes terminate while a valid purchased exit remains usable", () => {
  const a = item("A"),
    b = item("B"),
    f = item("Final");
  const w = world(
    [a, b, f],
    [
      recipe("A", a, [{ name: "B", quantity: 1 }]),
      recipe("B", b, [{ name: "A", quantity: 1 }]),
      recipe("Final", f, [{ name: "A", quantity: 1 }]),
    ],
    [buy("B", 7)],
  );
  expect(new Planner(w, defaults().options, true, {}).routes(f)[0].cost).toBe(
    7,
  );
});
test("Can craft now ignores purchase/farm calculator settings and requires real ingredients", () => {
  const x = item("X"),
    f = item("Final"),
    w = world(
      [x, f],
      [recipe("Final recipe", f, [{ name: "X", quantity: 2 }])],
      [buy("X", 1)],
    );
  expect(canCraftNow(f, w, {})).toBe(false);
  w.inventory = [
    {
      key: "X",
      name: "X",
      label: "X",
      quantity: 2,
      place: "inventory",
      raw: {},
    },
  ];
  expect(canCraftNow(f, w, {})).toBe(true);
  expect(canCraftNow(f, w, { X: 1 })).toBe(false);
});
test("headline numbers share the best valid sale/source route", () => {
  const x = item("X"),
    w = world([x], [], [buy("X", 5)]);
  w.markets.push({
    id: "better",
    name: "Better",
    availability: "available",
    bonus: 0.5,
    multiplier: 1,
    raw: {},
  });
  const row = evaluateRow(x, w, defaults());
  const best = row.alternatives[0];
  expect(best.quote.market).toBe("Better");
  expect(row.cost).toEqual({ state: "value", value: 5 });
  expect(row.profit).toEqual({ state: "value", value: best.sale - 5 });
});
test("selected tier is a ceiling and preserves lower-result comparisons", () => {
  const x = item("X"),
    y = item("Y"),
    r = recipe("Recipe", x, []);
  r.outputs.perfect = { name: "Y", quantity: 1, raw: y.raw };
  const w = world([x, y], [r]);
  expect(evaluateRow(x, w, defaults()).cost.state).toBe("value");
  expect(evaluateRow(x, w, defaults()).sale.state).toBe("value");
  expect(evaluateRow(x, w, defaults()).route?.output?.tier).toBe("basic");
});
test("knowledge purchases are not fabricated inventory for resale", () => {
  const book=item("Recipe scroll", {kind:"recipe"});
  const offer={...buy(book.name,1),acquires:"knowledge" as const};
  const w=world([book],[],[offer]);
  expect(new Planner(w,defaults().options,true,{}).routes(book)).toEqual([]);
});
test("sale hover uses the quality of the selected headline recipe", () => {
  const x=item("X"),device=item("Device",{kind:"device",upgradeHarmonies:{forge:{}}});
  const low=recipe("Low",device,[{name:"X",quantity:1}]);
  const high=recipe("High",device,[{name:"X",quantity:2}]);
  for(const r of [low,high]){r.outputs.sublime={name:device.name,quantity:1,raw:device.raw};r.record.sublimeCount=1;}
  low.record.sublimeBestResult=230;high.record.sublimeBestResult=618;
  const w=world([x,device],[low,high],[buy("X",1)]),prefs=defaults();prefs.options.tier="sublime";
  const row=evaluateRow(device,w,prefs);
  expect(row.route?.recipe?.name).toBe("High");
  expect(row.quotes[0].price).toEqual(row.sale);
});
test("a truncated search is not reported as a proven cheapest route", () => {
  const x = item("X"),
    a = item("A"),
    r = recipe("A recipe", a, [
      { name: "X", quantity: 15 },
      { name: "X", quantity: 15 },
    ]),
    w = world([x, a], [r], [buy("X", 2)]);
  const planner = new Planner(w, defaults().options, true, {}, 1);
  planner.routes(a);
  expect(planner.limited).toBe(true);
});
