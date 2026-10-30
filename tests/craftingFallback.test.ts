import { defaults } from "../src/domain/model";
import { evaluateRow, routeCost, refundCredit } from "../src/planner/engine";
import { resolveItemOutput } from "../src/mechanics/results";
import { instantYieldLabel } from "../src/query/itemPreview";
import { item, recipe, world, buy } from "./helpers";

test("Insight-like repeat uses five or six pills instead of base three and values random ingredient refunds", () => {
  const pill = item("Insight Pill+ (I)", { kind: "pill" }),
    herb = item("Lesser Yuhe Herb"),
    grass = item("Lesser Spirit Grass");
  const r = recipe(
    "Insight Pill (I) Recipe",
    pill,
    [
      { name: herb.name, quantity: 2 },
      { name: grass.name, quantity: 2 },
    ],
    3,
  );
  r.perfection = 200;
  r.completion = 200;
  r.record = {
    perfectCount: 2,
    perfectBestResult: 2037,
    perfectBestCompletion: 2037,
  };
  const w = world(
    [pill, herb, grass],
    [r],
    [buy(herb.name, 33), buy(grass.name, 16)],
  );
  const prefs = defaults();
  prefs.options = {
    tier: "sublime",
    quality: "achieved",
    buy: true,
    farm: false,
    inventory: false,
  };
  const row = evaluateRow(pill, w, prefs);
  expect(row.route?.output).toMatchObject({
    tier: "perfect",
    instant: true,
    quantity: 5,
    maxQuantity: 6,
    refundMax: 3,
  });
  expect(row.cost).toEqual({ state: "value", value: 98 / 5, lower: 16 / 5 });
  expect(row.route?.cost).toBe(98); // Full batch must be purchased before any refund.
  expect(instantYieldLabel(pill, r, "sublime", w)).toBe(
    "Yield: 5–6 at Perfect",
  );
  expect(
    row.profit.state === "value" &&
      row.sale.state === "value" &&
      row.profit.value,
  ).toBe(row.sale.state === "value" ? row.sale.value - 98 / 5 : false);
  prefs.options.quality = 20;
  expect(evaluateRow(pill, w, prefs).route?.quality).toBe(0);
});
test("ceiling allows a normal-only item and caps instant star plans to the repeat range", () => {
  const ordinary = item("Basic"),
    r = recipe("Basic recipe", ordinary, []);
  delete r.outputs.perfect;
  const w = world([ordinary], [r]);
  expect(resolveItemOutput(r, ordinary.name, "sublime", 20, w)).toMatchObject({
    tier: "basic",
    quality: 0,
  });
  const device = item("Device", {
      kind: "ore_extractor",
      upgradeHarmonies: { forge: true },
    }),
    d = recipe("Device recipe", device, []);
  d.outputs.sublime = d.outputs.perfect;
  d.record.sublimeCount = 1;
  d.record.sublimeBestResult = 464;
  expect(resolveItemOutput(d, device.name, "sublime", 20, w)).toMatchObject({
    tier: "sublime",
    quality: 2,
    maxQuality: 2,
  });
});
test("refund lower bound cannot spend refunds or credit free ingredients", () => {
  expect(
    routeCost({ cost: 0, quantity: 5, refundCreditMax: 82 } as any),
  ).toEqual({ state: "value", value: 0 });
  const h=item("H"), c=item("C"), final=item("Final");
  const outer=recipe("Outer",final,[{name:"H",quantity:1},{name:"C",quantity:1}]);
  const output={quantity:1,maxQuantity:1,quality:0,maxQuality:0,tier:"perfect" as const,basis:"Achieved repeat yield",instant:true,conditional:false,refundMax:1};
  expect(refundCredit(outer,output,[{kind:"inventory",item:h.name,quantity:1,label:"owned",cost:0},{kind:"buy",item:h.name,quantity:1,label:"market",cost:33},{kind:"craft",item:c.name,quantity:1,label:"nested",cost:0},{kind:"craft",item:final.name,quantity:1,label:"outer",cost:0}],1)).toBe(0);
});
