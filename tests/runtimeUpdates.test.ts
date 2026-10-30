import { createFixture } from "../harness/fixture";
import { createProfitSelector, createFlagSelector } from "../src/state/changes";
import { saveCache, updateCachedWorld, cachedRow } from "../src/state/runtime";
import { cachedArbitrageRows } from "../src/planner/arbitrage";
import { createTravelReader } from "../src/planner/travel";
import { caravanCargoKey } from "../src/state/caravan";
import { CaravanPlan } from "../src/planner/caravan";
import { defaults, obj, Raw } from "../src/domain/model";
import { readWorld } from "../src/catalogue/readWorld";
import { RecipeReader } from "../src/game/api";
import { evaluateRow } from "../src/planner/engine";

function setup() {
  const f = createFixture(),
    selector = createProfitSelector(),
    flags = createFlagSelector(f.api.gameData, f.flags),
    cache = saveCache();
  const derive = jest.spyOn(f.api.utils, "deriveRecipeDifficulty");
  const discount = jest.spyOn(f.api.utils, "getCharismaDiscount");
  const read = (raw: Raw, values: Record<string, number> = f.flags) =>
    updateCachedWorld(cache, f.api, selector(raw), values, flags(values), "en");
  const state = f.getState(),
    world = read(state);
  expect(derive).toHaveBeenCalledTimes(19);
  derive.mockClear();
  discount.mockClear();
  return { f, selector, flags, cache, derive, discount, read, state, world };
}
test("idle/UI/combat/cash-only events never rebuild the catalogue or derive recipes", () => {
  const h = setup();
  const p = obj(h.state.player);
  const selected = h.selector(h.state);
  for (let i = 0; i < 100; i++) {
    const state = {
      ...h.state,
      calendar: { day: i },
      combat: { tick: i },
      player: { ...p, player: { ...obj(p.player), hp: i, qi: i } },
    };
    expect(h.selector(state)).toBe(selected);
    expect(h.read(state, { ...h.f.flags, hp: i, combatTurn: i })).toBe(h.world);
  }
  const cash = {
    ...h.state,
    inventory: { ...obj(h.state.inventory), money: 1234 },
  };
  expect(h.read(cash)).toBe(h.world);
  expect(h.derive).not.toHaveBeenCalled();
  expect(h.discount).not.toHaveBeenCalled();
});
test("one purchase updates inventory and one market, invalidating only its item and recipe consumers", () => {
  const h = setup(),
    prefs = defaults();
  const leaf = h.world.items.get("Moonleaf")!,
    ore = h.world.items.get("Jade ore")!,
    dependent = h.world.items.get("Clear Spring Elixir")!;
  const leafRow = cachedRow(h.cache, "options", leaf, h.world, prefs),
    oreRow = cachedRow(h.cache, "options", ore, h.world, prefs),
    dependentRow = cachedRow(h.cache, "options", dependent, h.world, prefs);
  const oldTrades = cachedArbitrageRows(h.world);
  h.f.simulatePurchase();
  const next = h.read(h.f.getState());
  expect(h.derive).not.toHaveBeenCalled();
  expect(next.items).toBe(h.world.items);
  expect(next.recipes).toBe(h.world.recipes);
  expect(next.markets.find((m) => m.id === "Mountain market")).toBe(
    h.world.markets.find((m) => m.id === "Mountain market"),
  );
  expect(next.markets).toBe(h.world.markets);
  expect(h.discount).not.toHaveBeenCalled();
  const trades = cachedArbitrageRows(next);
  expect(trades.find((r) => r.item.name === "Moonleaf")).toBe(
    oldTrades.find((r) => r.item.name === "Moonleaf"),
  );
  expect(trades.find((r) => r.item.name === "Jade ore")).not.toBe(
    oldTrades.find((r) => r.item.name === "Jade ore"),
  );
  expect(cachedRow(h.cache, "options", leaf, next, prefs)).toBe(leafRow);
  expect(cachedRow(h.cache, "options", ore, next, prefs)).not.toBe(oreRow);
  expect(cachedRow(h.cache, "options", dependent, next, prefs)).not.toBe(
    dependentRow,
  );
  expect(h.cache.itemRevisions.has("Moonleaf")).toBe(false);
});
test("unrelated pickups do not trigger caravan cargo replanning", () => {
  const h = setup(),
    plan = { tracked: [{ key: h.world.inventory[0].key }] } as CaravanPlan;
  const key = caravanCargoKey(plan, h.world);
  expect(
    caravanCargoKey(plan, {
      ...h.world,
      inventory: [
        ...h.world.inventory,
        { ...h.world.inventory[0], key: "unrelated", quantity: 99 },
      ],
    }),
  ).toBe(key);
  expect(
    caravanCargoKey(plan, {
      ...h.world,
      inventory: h.world.inventory.map((i, index) =>
        index === 0 ? { ...i, quantity: i.quantity + 1 } : i,
      ),
    }),
  ).not.toBe(key);
});
test("newly registered learned recipes, locale switches and access conditions invalidate the appropriate domains", () => {
  const h = setup(),
    items = obj(h.f.api.gameData.items),
    base = items["Insight Pill (I) Recipe"];
  items["New recipe"] = { ...obj(base), name: "New recipe" };
  const state = {
    ...h.state,
    inventory: {
      ...obj(h.state.inventory),
      recipes: [
        ...(obj(h.state.inventory).recipes as Raw[]),
        { name: "New recipe", basicCount: 1 },
      ],
    },
  };
  const next = h.read(state);
  expect(next.recipes.find((r) => r.name === "New recipe")?.known).toBe(true);
  expect(h.derive).toHaveBeenCalledTimes(20);
  h.derive.mockClear();
  updateCachedWorld(
    h.cache,
    h.f.api,
    h.selector(state),
    h.f.flags,
    h.flags(h.f.flags),
    "de",
  );
  expect(h.derive).toHaveBeenCalledTimes(20);
});
test("learning or improving one recipe patches its record without re-deriving all recipes or repricing markets", () => {
  const h = setup(),
    inv = obj(h.state.inventory),
    records = inv.recipes as Raw[];
  const updated = {
    ...h.state,
    inventory: {
      ...inv,
      recipes: records.map((r, i) =>
        i === 0 ? { ...r, perfectBestResult: 999 } : r,
      ),
    },
  };
  const next = h.read(updated);
  expect(next.recipes[0].record.perfectBestResult).toBe(999);
  expect(next.recipes[1]).toBe(h.world.recipes[1]);
  expect(next.markets).toBe(h.world.markets);
  expect(h.derive).not.toHaveBeenCalled();
  expect(h.discount).not.toHaveBeenCalled();
  const learned = {
    ...updated,
    inventory: {
      ...obj(updated.inventory),
      recipes: [
        ...(obj(updated.inventory).recipes as Raw[]),
        { name: "Renewal Pill Recipe", basicCount: 0 },
      ],
    },
  };
  expect(
    h.read(learned).recipes.find((r) => r.name === "Renewal Pill Recipe")
      ?.known,
  ).toBe(true);
  expect(h.derive).not.toHaveBeenCalled();
});
test("reputation updates its market group without recipe scans; cash/cargo do not rebuild travel distances", () => {
  const h = setup(),
    p = obj(obj(h.state.player).player);
  const updated = {
    ...h.state,
    player: {
      player: { ...p, reputation: { ...obj(p.reputation), Valley: 10 } },
    },
  };
  const next = h.read(updated);
  expect(h.derive).not.toHaveBeenCalled();
  expect(next.recipes).toBe(h.world.recipes);
  expect(next.markets.find((m) => m.id === "Mountain market")).toBe(
    h.world.markets.find((m) => m.id === "Mountain market"),
  );
  expect(
    next.markets.find((m) => m.id === "Valley market")?.bonus,
  ).toBeGreaterThan(
    h.world.markets.find((m) => m.id === "Valley market")!.bonus,
  );
  const discover = jest.spyOn(h.f.api.utils, "discoverUnlockedLocations"),
    travel = createTravelReader();
  const first = travel(h.f.api, h.state, h.f.flags, h.world);
  discover.mockClear();
  const second = travel(
    h.f.api,
    { ...h.state, inventory: { ...obj(h.state.inventory), money: 20 } },
    h.f.flags,
    h.world,
  );
  expect(second.cash).toBe(20);
  expect(second.days).toBe(first.days);
  expect(discover).not.toHaveBeenCalled();
});
test("inventory-only events retain market quotes and arbitrage cache, while relevant access flags refresh sources", () => {
  const h = setup(),
    rows = cachedArbitrageRows(h.world),
    inv = obj(h.state.inventory);
  const next = h.read({
    ...h.state,
    inventory: {
      ...inv,
      items: (inv.items as Raw[]).map((v, i) =>
        i === 0 ? { ...v, stacks: 99 } : v,
      ),
    },
  });
  expect(next.markets).toBe(h.world.markets);
  expect(next.sources).toBe(h.world.sources);
  expect(cachedArbitrageRows(next)).toBe(rows);
  expect(h.derive).not.toHaveBeenCalled();
  const f = createFixture();
  obj(f.api.gameData.locations)["Locked"] = {
    name: "Locked",
    buildings: [
      {
        kind: "market",
        disabled: "{questDone} == 0",
        itemPool: {},
        costMultiplier: 1,
      },
    ],
  };
  const flagSelect = createFlagSelector(f.api.gameData, {
    questDone: 0,
    hp: 0,
  });
  const a = flagSelect({ questDone: 0, hp: 1 }),
    b = flagSelect({ questDone: 0, hp: 2 });
  expect(a.values).toBe(b.values);
  expect(flagSelect({ questDone: 1, hp: 2 }).values).not.toBe(b.values);
});
test("access flags update source availability without recipe derivation", () => {
  const f = createFixture(),
    loc = obj(f.api.gameData.locations)["Valley market"] as Raw;
  (loc.buildings as Raw[])[1].disabled = "marketLocked";
  const selector = createProfitSelector(),
    flags = createFlagSelector(f.api.gameData, { ...f.flags, marketLocked: 0 }),
    cache = saveCache();
  const read = (locked: number) =>
    updateCachedWorld(
      cache,
      f.api,
      selector(f.getState()),
      { ...f.flags, marketLocked: locked },
      flags({ ...f.flags, marketLocked: locked }),
      "en",
    );
  expect(
    read(0).markets.find((m) => m.id === "Valley market")?.availability,
  ).toBe("available");
  const derive = jest.spyOn(f.api.utils, "deriveRecipeDifficulty");
  expect(
    read(1).markets.find((m) => m.id === "Valley market")?.availability,
  ).toBe("locked");
  expect(derive).not.toHaveBeenCalled();
});
test("a single offer price modifier requotes only that offer", () => {
  const h = setup(),
    location = obj(h.state.location),
    locations = obj(location.locations),
    valley = obj(locations["Valley market"]),
    buildings = obj(valley.buildingState),
    market = obj(buildings.market);
  const state = {
    ...h.state,
    location: {
      ...location,
      locations: {
        ...locations,
        "Valley market": {
          ...valley,
          buildingState: {
            ...buildings,
            market: {
              ...market,
              items: (market.items as Raw[]).map((i) =>
                i.name === "Jade ore" ? { ...i, valueModifier: 0.5 } : i,
              ),
            },
          },
        },
      },
    },
  };
  const next = h.read(state);
  expect(h.derive).not.toHaveBeenCalled();
  expect(h.discount).toHaveBeenCalledTimes(1);
  expect(
    next.sources.get("Jade ore")?.find((s) => s.marketId === "Valley market")
      ?.cost,
  ).not.toEqual(
    h.world.sources.get("Jade ore")?.find((s) => s.marketId === "Valley market")
      ?.cost,
  );
});
test("incremental event replay produces the same prices as independent full rebuilds", () => {
  const h = setup(),
    p = defaults();
  let state = h.state;
  const check = () => {
    const next = h.read(state),
      reader = new RecipeReader(h.f.api),
      full = readWorld(h.f.api, state, h.f.flags, reader, 1);
    reader.dispose();
    for (const name of [
      "Jade ore",
      "Moonleaf",
      "Clear Spring Elixir",
      "Insight Pill+ (I)",
    ]) {
      const a = cachedRow(h.cache, "replay", next.items.get(name)!, next, p),
        b = evaluateRow(full.items.get(name)!, full, p);
      for (const key of ["cost", "buy", "sale", "profit", "roi"] as const)
        expect(a[key]).toEqual(b[key]);
    }
  };
  check();
  h.f.simulatePurchase();
  state = h.f.getState();
  check();
  state = {
    ...state,
    inventory: {
      ...obj(state.inventory),
      recipes: (obj(state.inventory).recipes as Raw[]).map((r) =>
        r.name === "Insight Pill (I) Recipe"
          ? { ...r, perfectBestResult: 1000 }
          : r,
      ),
    },
  };
  check();
  const player = obj(obj(state.player).player);
  state = {
    ...state,
    player: {
      player: {
        ...player,
        reputation: { ...obj(player.reputation), Valley: 15 },
      },
    },
  };
  check();
  const latest = obj(obj(state.player).player);
  state = {
    ...state,
    player: {
      player: {
        ...latest,
        socialStats: { ...obj(latest.socialStats), craftskill: 1500 },
      },
    },
  };
  check();
});
