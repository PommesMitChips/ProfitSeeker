import { Item, Recipe, Source, World, Raw } from "../src/domain/model";
export const item = (name: string, extra: Raw = {}): Item => ({
  key: name,
  name,
  label: name,
  description: "",
  kind: "material",
  realm: "bodyForging",
  icon: "",
  raw: {
    name,
    kind: "material",
    realm: "bodyForging",
    rarity: "mundane",
    stacks: 1,
    ...extra,
  },
});
export function recipe(
  name: string,
  output: Item,
  ingredients: { name: string; quantity: number }[],
  quantity = 1,
): Recipe {
  return {
    name,
    ingredients,
    raw: { name, realm: "bodyForging", realmProgress: "Early" },
    known: true,
    record: { basicCount: 1, perfectCount: 1, perfectBestResult: 100 },
    perfection: 100,
    outputs: {
      basic: { name: output.name, quantity, raw: output.raw },
      perfect: { name: output.name, quantity, raw: output.raw },
    },
  };
}
export const buy = (
  name: string,
  cost: number,
  quantity = 100,
  id = name,
): Source => ({
  id,
  kind: "buy",
  marketId: "market",
  item: name,
  label: id,
  location: id,
  availability: "available",
  repeatable: true,
  quantity,
  currency: "Spirit Stones",
  cost: { state: "value", value: cost },
});
export function world(
  items: Item[],
  recipes: Recipe[] = [],
  sources: Source[] = [],
): World {
  const byOutput = new Map<string, Recipe[]>(),
    bySource = new Map<string, Source[]>();
  for (const r of recipes)
    for (const name of new Set(Object.values(r.outputs).map((o) => o.name)))
      byOutput.set(name, [...(byOutput.get(name) ?? []), r]);
  for (const s of sources)
    bySource.set(s.item, [...(bySource.get(s.item) ?? []), s]);
  return {
    items: new Map(items.map((i) => [i.name, i])),
    recipes,
    recipesByOutput: byOutput,
    sources: bySource,
    markets: [
      {
        id: "market",
        name: "Market",
        availability: "available",
        bonus: 0,
        multiplier: 1,
        raw: {},
      },
    ],
    inventory: [],
    player: { realm: "bodyForging" },
    flags: { pathOfSublimeCraftingComplete: 1 },
    revision: 1,
    issues: [],
    gameVersion: "0.7.18-97c093b",
    pricingVerified: true,
  };
}
