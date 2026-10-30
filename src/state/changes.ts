import { GameAPI } from "../game/api";
import { Raw, World, list, obj, str, num } from "../domain/model";
import { WorldReadPlan } from "../catalogue/readWorld";
import { effectiveCharisma } from "../mechanics/pricing";

const same = (a: Raw, b: Raw) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => a[k] === b[k]);
const stable = (old: Raw, next: Raw) => (same(old, next) ? old : next);
const volatilePlayer = new Set(["qi", "hp", "imageId", "sex"]);
/** Redux notifications are the event source. Ignore combat/UI/currency favourites;
 * keep stable references so unrelated dispatches do not render the mod. */
export function createProfitSelector() {
  let prior: Raw = {},
    player: Raw = {},
    inventory: Raw = {},
    location: Raw = {},
    marketStates: Raw = {},
    lastLocations: unknown;
  return (state: Raw): Raw => {
    const p = obj(obj(state.player).player),
      inv = obj(state.inventory),
      loc = obj(state.location);
    player = stable(
      player,
      Object.fromEntries(
        Object.entries(p).filter(([k]) => !volatilePlayer.has(k)),
      ),
    );
    inventory = stable(inventory, {
      items: inv.items,
      storage: inv.storage,
      recipes: inv.recipes,
      money: inv.money,
    });
    if (lastLocations !== loc.locations) {
      const next: Raw = {};
      for (const [id, v] of Object.entries(obj(loc.locations))) {
        const market = obj(obj(v).buildingState).market;
        if (market !== undefined)
          next[id] =
            obj(obj(marketStates[id]).buildingState).market === market
              ? marketStates[id]
              : { buildingState: { market } };
      }
      marketStates = stable(marketStates, next);
      lastLocations = loc.locations;
    }
    location = stable(location, {
      current: loc.current,
      visited: loc.visited,
      locations: marketStates,
    });
    const next = {
      inventory,
      player: obj(prior.player).player === player ? prior.player : { player },
      location,
      breakthrough: state.breakthrough,
      version: state.version,
      newGame: state.newGame,
      mod: state.mod,
    };
    return (prior = stable(prior, next));
  };
}
export interface FlagSelection {
  values: Record<string, number>;
  rules: Set<string>;
  access: Set<string>;
  prices: Set<string>;
}
/** Collect named expression inputs once, rather than stringify every game flag. */
export function createFlagSelector(data: Raw, initial: Record<string, number>) {
  const access = new Set<string>(),
    rules = new Set<string>(),
    prices = new Set<string>();
  const collect = (
    value: unknown,
    out: Set<string>,
    seen = new Set<object>(),
  ) => {
    if (typeof value === "string") {
      for (const m of value.matchAll(/\{([^{}]+)\}/g)) out.add(m[1]);
      if (/^[\w.]+$/.test(value)) out.add(value);
    } else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value);
      for (const child of Object.values(value)) collect(child, out, seen);
    }
  };
  const conditional = (value: unknown, seen = new Set<object>()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (/^(condition|conditions|disabled|unlockCondition)$/.test(key))
        collect(child, access);
      else conditional(child, seen);
    }
  };
  conditional(data.locations);
  conditional(data.crops);
  conditional(data.mineConfigs);
  for (const item of [
    ...Object.values(obj(data.items)),
    ...Object.values(obj(data.researchableMap)).flatMap(list),
  ])
    if (obj(item).kind === "recipe") {
      collect(obj(item).condition, rules);
      collect(obj(item).disabled, rules);
    }
  for (const key of Object.keys(initial)) {
    if (/charisma|discount/i.test(key)) prices.add(key);
    if (
      /perfection|completion|sublime|harmony|crafting.*(bonus|modifier|multiplier)/i.test(
        key,
      )
    )
      rules.add(key);
  }
  rules.add("pathOfSublimeCraftingComplete");
  const keys = new Set([...access, ...rules, ...prices]);
  let previous: Record<string, number> = {};
  return (flags: Record<string, number>): FlagSelection => {
    const next = Object.fromEntries(
      [...keys].filter((k) => flags[k] !== undefined).map((k) => [k, flags[k]]),
    );
    if (!same(previous, next)) previous = next;
    return { values: previous, rules, access, prices };
  };
}
export interface WorldInputs {
  api: GameAPI;
  state: Raw;
  flags: FlagSelection;
  language: string;
  registries: unknown[];
  mods: Raw;
  charisma?: number;
  discounts: string;
}
export function worldInputs(
  api: GameAPI,
  state: Raw,
  flags: FlagSelection,
  language: string,
  previous?: WorldInputs,
): WorldInputs {
  const p = obj(obj(state.player).player),
    old = obj(obj(previous?.state.player).player),
    fields = [
      "monthBuffs",
      "clothing",
      "talismans",
      "artefacts",
      "mount",
      "destiny",
      "background",
      "knownTechniques",
    ];
  const dirty =
    !previous ||
    previous.api !== api ||
    [...flags.prices].some(
      (k) => previous.flags.values[k] !== flags.values[k],
    ) ||
    num(obj(p.socialStats).charisma) !== num(obj(old.socialStats).charisma) ||
    fields.some((k) => p[k] !== old[k]) ||
    obj(obj(state.breakthrough).qiCondensation).art !==
      obj(obj(previous.state.breakthrough).qiCondensation).art;
  let charisma = previous?.charisma,
    discounts = previous?.discounts ?? "";
  if (dirty) {
    charisma = effectiveCharisma(api, p, obj(state.breakthrough));
    try {
      discounts = JSON.stringify(
        (api.utils.getDestinies?.(p) ?? []).map((d) => obj(d).locationDiscount),
      );
    } catch {
      discounts = "unknown";
    }
  }
  return {
    api,
    state,
    flags,
    language,
    registries: [
      "items",
      "researchableMap",
      "locations",
      "crops",
      "mineConfigs",
      "backgrounds",
    ].map((k) => api.gameData[k]),
    mods: { active: obj(state.mod).activeMods },
    charisma,
    discounts,
  };
}
const differs = (a: unknown, b: unknown) =>
  a !== b && JSON.stringify(a) !== JSON.stringify(b);
export function changedInventoryNames(before: Raw, after: Raw): Set<string> {
  const totals = (inv: Raw) => {
    const map = new Map<string, string[]>();
    for (const item of [...list(inv.items), ...list(inv.storage)]) {
      const name = str(item.name);
      map.set(name, [...(map.get(name) ?? []), JSON.stringify(item)]);
    }
    return map;
  };
  const a = totals(before),
    b = totals(after);
  return new Set(
    [...new Set([...a.keys(), ...b.keys()])].filter((k) =>
      differs(a.get(k), b.get(k)),
    ),
  );
}
export interface WorldChange {
  full: boolean;
  read: WorldReadPlan;
  items: Set<string>;
  allRows: boolean;
  marketChanged: boolean;
}
export function planWorldChange(
  previous: WorldInputs | undefined,
  next: WorldInputs,
  world: World | null,
): WorldChange {
  const read: WorldReadPlan = {
    inventory: false,
    recipes: false,
    records: new Set(),
    markets: false,
    sources: false,
  };
  const result: WorldChange = {
    full: false,
    read,
    items: new Set(),
    allRows: false,
    marketChanged: false,
  };
  if (
    !previous ||
    !world ||
    previous.api !== next.api ||
    previous.language !== next.language ||
    next.registries.some((v, i) => v !== previous.registries[i]) ||
    !same(previous.mods, next.mods) ||
    differs(previous.state.version, next.state.version)
  ) {
    return {
      full: true,
      read: {
        inventory: true,
        recipes: true,
        records: new Set(),
        markets: true,
        sources: true,
      },
      items: new Set(),
      allRows: true,
      marketChanged: true,
    };
  }
  const before = previous.state,
    after = next.state,
    bi = obj(before.inventory),
    ai = obj(after.inventory),
    bp = obj(obj(before.player).player),
    ap = obj(obj(after.player).player),
    bl = obj(before.location),
    al = obj(after.location);
  if (bi.items !== ai.items || bi.storage !== ai.storage) {
    result.items = changedInventoryNames(bi, ai);
    read.inventory = result.items.size > 0;
  }
  if (bi.recipes !== ai.recipes) {
    const old = new Map(list(bi.recipes).map((r) => [str(r.name), r])),
      current = new Map(list(ai.recipes).map((r) => [str(r.name), r]));
    for (const name of new Set([...old.keys(), ...current.keys()]))
      if (differs(old.get(name), current.get(name))) read.records.add(name);
    if (
      [...read.records].some(
        (name) =>
          current.has(name) && !world.recipes.some((r) => r.name === name),
      )
    )
      return {
        full: true,
        read: {
          inventory: true,
          recipes: true,
          records: new Set(),
          markets: true,
          sources: true,
        },
        items: new Set(),
        allRows: true,
        marketChanged: true,
      };
  }
  if (
    num(obj(bp.socialStats).craftskill) !== num(obj(ap.socialStats).craftskill)
  )
    for (const r of world.recipes) read.records.add(r.name);
  const marketIds = new Set<string>();
  const oldLocations = obj(bl.locations),
    newLocations = obj(al.locations);
  if (oldLocations !== newLocations)
    for (const id of new Set([
      ...Object.keys(oldLocations),
      ...Object.keys(newLocations),
    ])) {
      const old = obj(obj(oldLocations[id]).buildingState).market,
        current = obj(obj(newLocations[id]).buildingState).market;
      if (differs(obj(old).items, obj(current).items)) marketIds.add(id);
    }
  const reputationChanged = Object.keys({
    ...obj(bp.reputation),
    ...obj(ap.reputation),
  }).filter((k) => obj(bp.reputation)[k] !== obj(ap.reputation)[k]);
  for (const m of world.markets)
    if (
      reputationChanged.includes(
        str(obj(obj(next.registries[2])[m.id]).reputationName),
      )
    )
      marketIds.add(m.id);
  const pricingChanged =
    !Object.is(previous.charisma, next.charisma) ||
    previous.discounts !== next.discounts ||
    [...next.flags.prices].some(
      (k) => previous.flags.values[k] !== next.flags.values[k],
    );
  const changedFlags =
    previous.flags.values === next.flags.values
      ? []
      : [
          ...new Set([
            ...Object.keys(previous.flags.values),
            ...Object.keys(next.flags.values),
          ]),
        ].filter((k) => previous.flags.values[k] !== next.flags.values[k]);
  read.recipes =
    changedFlags.some((k) => next.flags.rules.has(k)) ||
    [
      "cauldron",
      "flame",
      "craftingTechniques",
      "destiny",
      "realm",
      "realmProgress",
    ].some((k) => differs(bp[k], ap[k]));
  read.sources =
    changedFlags.some((k) => next.flags.access.has(k)) ||
    bp.realm !== ap.realm ||
    differs(bl.visited, al.visited) ||
    (bl.current !== al.current &&
      !world.knownLocations?.has(str(al.current))) ||
    [...marketIds].some((id) => !world.markets.some((m) => m.id === id));
  read.prices = pricingChanged || reputationChanged.length > 0 || read.sources;
  read.markets =
    pricingChanged || read.sources ? true : marketIds.size ? marketIds : false;
  result.marketChanged = !!read.markets;
  // Price changes can change the best sale destination for any item.
  result.allRows =
    pricingChanged ||
    reputationChanged.length > 0 ||
    read.recipes ||
    read.sources;
  for (const name of read.records)
    for (const r of world.recipes.filter((r) => r.name === name))
      for (const o of Object.values(r.outputs)) result.items.add(o.name);
  if (read.markets instanceof Set)
    for (const id of read.markets) {
      const beforeItems = obj(
          obj(obj(oldLocations[id]).buildingState).market,
        ).items,
        afterItems = obj(obj(obj(newLocations[id]).buildingState).market).items;
      for (const name of changedInventoryNames(
        { items: beforeItems },
        { items: afterItems },
      ))
        result.items.add(name);
    }
  return result;
}
export const hasWorldWork = (change: WorldChange) =>
  change.full ||
  change.read.inventory ||
  change.read.recipes ||
  change.read.records.size > 0 ||
  !!change.read.markets ||
  change.read.sources;
/** Input changes affect recipes consuming that item, including intermediate chains. */
export function affectedItems(world: World, names: Set<string>): Set<string> {
  const result = new Set(names),
    queue = [...names],
    consumers = new Map<string, string[]>();
  for (const r of world.recipes)
    for (const input of r.ingredients)
      consumers.set(input.name, [
        ...(consumers.get(input.name) ?? []),
        ...Object.values(r.outputs).map((o) => o.name),
      ]);
  for (let i = 0; i < queue.length; i++)
    for (const name of consumers.get(queue[i]) ?? [])
      if (!result.has(name)) {
        result.add(name);
        queue.push(name);
      }
  return result;
}
