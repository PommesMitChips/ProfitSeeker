import { Raw, obj } from "../src/domain/model";
import { GameAPI } from "../src/game/api";
import { BUY, nameFactor } from "../src/mechanics/pricing";
export function createFixture() {
  const items: Record<string, Raw> = {};
  const item = (name: string, kind = "material", extra: Raw = {}) =>
    (items[name] = {
      name,
      kind,
      realm: "bodyForging",
      rarity: "mundane",
      stacks: 1,
      description: `${name} from the valley. Development fixture.`,
      ...extra,
    });
  const herb = item("Moonleaf"),
    ore = item("Jade ore"),
    dust = item("Spirit dust"),
    cloth = item("Spirit thread");
  const known: Raw[] = [];
  for (let i = 0; i < 18; i++) {
    const product = item(
      [
        "Quiet Mind Pill",
        "Clear Spring Elixir",
        "Jade Ward",
        "Cloudstep Talisman",
        "Renewal Pill",
        "Deep Breath Pill",
      ][i % 6] + (i > 5 ? ` ${Math.floor(i / 6) + 1}` : ""),
      i % 3 === 0 ? "pill" : i % 3 === 1 ? "elixir" : "talisman",
      { valueTier: 1 + i * 0.2, rarity: i > 10 ? "empowered" : "mundane" },
    );
    const recipe = {
      ...item(`${product.name} Recipe`, "recipe"),
      baseItem: { ...product, stacks: 2 },
      perfectItem: { ...product, stacks: i % 3 === 2 ? 1 : 5 },
      sublimeItem: { ...product, stacks: i % 3 === 2 ? 1 : 8 },
      ingredients: [
        { item: i % 2 ? ore : herb, quantity: 4 + (i % 4) },
        { item: i % 2 ? dust : cloth, quantity: 1 },
      ],
      realmProgress: "Early",
      difficulty: "easy",
    };
    items[String(recipe.name)] = recipe;
    if (i !== 4)
      known.push({
        name: recipe.name,
        basicCount: 1,
        perfectCount: 1,
        sublimeCount: i % 3 === 2 ? 0 : 1,
        perfectBestResult: 295,
        sublimeBestResult: 464,
        basicBestResult: 100,
      });
  }
  const locations: Raw = {};
  // Regression example: prices supplied by the user, native unmodified threshold.
  const yuhe = item("Lesser Yuhe Herb", "material", {
    valueTier: 33.5 / (BUY.material * 1.4 * nameFactor("Lesser Yuhe Herb")),
  });
  const grass = item("Lesser Spirit Grass", "material", {
    valueTier: 16.5 / (BUY.material * 1.4 * nameFactor("Lesser Spirit Grass")),
  });
  const insight = item("Insight Pill+ (I)", "pill", {
    rarity: "empowered",
    valueTier: 1.5,
  });
  const normalInsight = item("Insight Pill (I)", "pill");
  const insightRecipe = {
    ...item("Insight Pill (I) Recipe", "recipe"),
    baseItem: { ...normalInsight, stacks: 3 },
    perfectItem: { ...insight, stacks: 3 },
    ingredients: [
      { item: yuhe, quantity: 2 },
      { item: grass, quantity: 2 },
    ],
    realmProgress: "Middle",
    difficulty: "medium",
  };
  items[String(insightRecipe.name)] = insightRecipe;
  known.push({
    name: insightRecipe.name,
    basicCount: 4,
    perfectCount: 2,
    sublimeCount: 1,
    perfectBestResult: 2037,
    perfectBestCompletion: 2037,
  });
  for (const [name, multiplier, group] of [
    ["Valley market", 1.4, "Valley"],
    ["Mountain market", 2, "Mountain"],
    ["Distant market", 1, "Distant"],
  ] as const) {
    locations[name] = {
      name,
      displayName: name,
      reputationName: group,
      buildings: [
        {
          kind: "recipe",
          recipePool: { bodyForging: known.map((record) => record.name) },
        },
        {
          kind: "market",
          costMultiplier: multiplier,
          itemPool: {
            bodyForging:
              name === "Mountain market"
                ? [
                    { name: ore.name, stacks: 3 },
                    { name: dust.name, stacks: 30 },
                  ]
                : [
                    { name: herb.name, stacks: 90 },
                    { name: ore.name, stacks: 3 },
                    { name: dust.name, stacks: 30 },
                    { name: cloth.name, stacks: 40 },
                    { name: yuhe.name, stacks: 40 },
                    { name: grass.name, stacks: 40 },
                  ],
          },
          reputationPool: {},
          refreshMonths: 1,
        },
      ],
    };
  }
  let snapshot: Raw = {
    newGame: { createdAt: "fixture-character-1" },
    version: { version: "0.7.18-97c093b" },
    player: {
      player: {
        name: "Fixture character",
        realm: "bodyForging",
        socialStats: { charisma: 100, craftskill: 0 },
        talismans: [],
        artefacts: [],
        background: [],
        reputation: { Valley: 0, Mountain: 300, Distant: 0 },
      },
    },
    breakthrough: {},
    inventory: {
      money: 500,
      items: [
        { name: herb.name, stacks: 12 },
        { name: ore.name, stacks: 5 },
        { name: cloth.name, stacks: 2 },
      ],
      storage: [{ name: dust.name, stacks: 3 }],
      recipes: known,
    },
    location: {
      current: "Valley market",
      visited: ["Valley market", "Mountain market"],
      locations: Object.fromEntries(
        ["Valley market", "Mountain market"].map((name) => [
          name,
          {
            buildingState: {
              market: {
                items: obj((obj(locations[name]).buildings as Raw[])[1])
                  .itemPool
                  ? obj(
                      obj((obj(locations[name]).buildings as Raw[])[1])
                        .itemPool,
                    ).bodyForging
                  : [],
              },
            },
          },
        ]),
      ),
    },
    mod: { data: {} },
  };
  const listeners = new Set<() => void>(),
    callbacks: ((r: Raw, s: Raw, f: Record<string, number>) => Raw)[] = [];
  const flags = { pathOfSublimeCraftingComplete: 1 };
  const api: GameAPI = {
    gameData: {
      items,
      locations,
      backgrounds: { child: [], treasures: [] },
      crops: {},
      mineConfigs: {},
    },
    actions: { addTab() {} },
    utils: {
      getFullItem: (r) => ({ ...items[String(r.name)], ...r }),
      getDestinies: () => [],
      getCharismaDiscount: () => 1,
      getCraftSkillCap: () => 1000,
      getMoveSpeedMultiplier: () => 1,
      discoverUnlockedLocations: (_, found) => {
        found.push(
          {
            name: "Valley market",
            unlocks: [{ location: { name: "Mountain market" }, distance: 2 }],
          },
          { name: "Mountain market", unlocks: [] },
        );
      },
      t: (s) => s,
      evalExp: (e, f) => (e === "1" ? 1 : (f[e] ?? 0)),
      deriveRecipeDifficulty: (recipe, f) =>
        callbacks.reduce<Raw>((s, cb) => cb(recipe, s, f), {
          perfection: recipe.name === insightRecipe.name ? 160 : 100,
          completion: recipe.name === insightRecipe.name ? 160 : 100,
        }),
    },
    hooks: {
      onDeriveRecipeDifficulty: (callback) => {
        callbacks.push(callback);
        return () => {
          const index = callbacks.indexOf(callback);
          if (index >= 0) callbacks.splice(index, 1);
        };
      },
    },
    getGameStateSnapshot: () => snapshot,
    subscribe: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    api,
    flags,
    getState: () => snapshot,
    simulatePurchase: () => {
      const inv = obj(snapshot.inventory),
        entries = inv.items as Raw[];
      const location = obj(snapshot.location),
        places = obj(location.locations),
        valley = obj(places["Valley market"]),
        buildings = obj(valley.buildingState),
        market = obj(buildings.market);
      const stock = (market.items as Raw[]).map((e) =>
        e.name === ore.name
          ? { ...e, stacks: Math.max(0, Number(e.stacks) - 1) }
          : e,
      );
      snapshot = {
        ...snapshot,
        location: {
          ...location,
          locations: {
            ...places,
            "Valley market": {
              ...valley,
              buildingState: {
                ...buildings,
                market: { ...market, items: stock },
              },
            },
          },
        },
        inventory: {
          ...inv,
          money: Number(inv.money) - 120,
          items: entries.map((e) =>
            e.name === ore.name ? { ...e, stacks: Number(e.stacks) + 1 } : e,
          ),
        },
      };
      listeners.forEach((f) => f());
    },
    simulateSale: () => {
      const inv = obj(snapshot.inventory),
        entries = inv.items as Raw[];
      if (!entries.some((e) => e.name === ore.name && Number(e.stacks) > 5))
        return;
      snapshot = {
        ...snapshot,
        location: { ...obj(snapshot.location), current: "Mountain market" },
        inventory: {
          ...inv,
          money: Number(inv.money) + 129,
          items: entries.map((e) =>
            e.name === ore.name ? { ...e, stacks: Number(e.stacks) - 1 } : e,
          ),
        },
      };
      listeners.forEach((f) => f());
    },
    setModData: (mod: string, key: string, value: unknown) => {
      const data = obj(obj(snapshot.mod).data);
      snapshot = {
        ...snapshot,
        mod: { data: { ...data, [mod]: { ...obj(data[mod]), [key]: value } } },
      };
      listeners.forEach((f) => f());
    },
    switchCharacter: () => {
      snapshot = {
        ...snapshot,
        newGame: { createdAt: "fixture-character-2" },
        player: {
          player: {
            ...obj(obj(snapshot.player).player),
            name: "Second fixture character",
          },
        },
        mod: { data: {} },
        inventory: { items: [], storage: [], recipes: [] },
      };
      listeners.forEach((f) => f());
    },
  };
}
