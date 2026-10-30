import {
  Availability,
  Ingredient,
  InventoryEntry,
  Item,
  Market,
  Raw,
  Recipe,
  Source,
  Tier,
  World,
  REALMS,
  list,
  missing,
  num,
  obj,
  str,
} from "../domain/model";
import { GameAPI, RecipeReader, evaluateCondition } from "../game/api";
import {
  effectiveCharisma,
  purchasePrice,
  saleable,
} from "../mechanics/pricing";

export const TARGET_VERSION = "0.7.18-97c093b";
export interface WorldReadPlan {
  inventory: boolean;
  recipes: boolean;
  records: Set<string>;
  markets: boolean | Set<string>;
  prices?: boolean;
  sources: boolean;
}
export function variantKey(raw: Raw): string {
  const augment = obj(raw.harmonyAugment),
    enchantment = obj(raw.enchantment);
  return JSON.stringify([
    raw.name,
    augment.type ?? "",
    augment.quality ?? 0,
    raw.hiddenPotential ?? 0,
    enchantment.kind ?? "",
    enchantment.rarity ?? "",
  ]);
}
export function readWorld(
  api: GameAPI,
  state: Raw,
  flags: Record<string, number>,
  reader: RecipeReader | undefined,
  revision: number,
  previous?: World,
  update?: WorldReadPlan,
): World {
  const plan = update ?? {
    inventory: true,
    recipes: true,
    records: new Set<string>(),
    markets: true,
    sources: true,
  };
  const recipeWork = plan.recipes || plan.records.size > 0;
  const replaceSource = (s: Source) =>
    s.kind === "recipe"
      ? plan.recipes ||
        [...plan.records].some((name) => s.id.startsWith(`recipe:${name}:`))
      : s.kind === "buy"
        ? plan.markets === true ||
          (plan.markets instanceof Set &&
            !!s.marketId &&
            plan.markets.has(s.marketId))
        : plan.sources;
  let items = previous?.items ?? new Map<string, Item>();
  const recipes: Recipe[] = [],
    sources = previous
      ? recipeWork || plan.markets || plan.sources
        ? new Map(
            [...previous.sources].map(([name, entries]) => [
              name,
              entries.filter((s) => !replaceSource(s)),
            ]),
          )
        : previous.sources
      : new Map<string, Source[]>(),
    markets: Market[] = previous
      ? previous.markets.filter(
          (m) =>
            !(
              plan.markets === true ||
              (plan.markets instanceof Set && plan.markets.has(m.id))
            ),
        )
      : [],
    issues: string[] = [];
  const data = api.gameData,
    inventoryState = obj(state.inventory),
    player = obj(obj(state.player).player),
    locations = obj(data.locations),
    locationState = obj(state.location);
  const records = new Map(
    list(inventoryState.recipes).map((r) => [str(r.name), r]),
  );
  const version = str(obj(state.version).version);
  const pricingVerified = version === TARGET_VERSION;
  if (!pricingVerified)
    issues.push(
      `Price rules are verified for ${TARGET_VERSION}; this save reports ${version || "no version"}.`,
    );
  const condition = (x: unknown) => evaluateCondition(api, x, flags);
  const source = (entry: Source) => {
    if (!entry.item) return;
    const all = sources.get(entry.item) ?? [];
    if (!all.some((s) => s.id === entry.id)) all.push(entry);
    sources.set(entry.item, all);
  };
  const translate = (x: unknown) => {
    const text = str(x);
    try {
      return api.utils.t?.(text) ?? text;
    } catch {
      return text;
    }
  };
  function addItem(input: Raw): Item | undefined {
    const name = str(input.name);
    if (!name) return;
    if (items.has(name)) return items.get(name);
    let raw = input;
    if (!str(input.kind)) {
      try {
        raw = obj(api.utils.getFullItem?.(input));
      } catch {
        raw = {};
      }
    }
    if (!str(raw.kind) || str(raw.name) !== name) {
      issues.push(`Unresolved item: ${name}`);
      return;
    }
    const item: Item = {
      key: name,
      name,
      label:
        translate(
          typeof raw.displayName === "string" && raw.displayName.trim()
            ? raw.displayName
            : name,
        ) || name,
      description: translate(raw.description),
      kind: str(raw.kind),
      realm: str(raw.realm),
      icon: str(raw.icon),
      raw,
    };
    if (previous && items === previous.items) items = new Map(items);
    items.set(name, item);
    return item;
  }
  if (!previous) {
    for (const raw of Object.values(obj(data.items))) addItem(obj(raw));
    for (const definition of Object.values(obj(data.researchableMap)).flatMap(
      (v) => list(v),
    ))
      addItem(definition);
  }
  if (previous && !plan.recipes) {
    for (const old of previous.recipes) {
      if (!plan.records.has(old.name)) {
        recipes.push(old);
        continue;
      }
      let cap: number | undefined;
      try {
        cap = api.utils.getCraftSkillCap?.(
          str(old.raw.realm),
          str(old.raw.realmProgress),
        );
      } catch {}
      const next = {
        ...old,
        known: records.has(old.name),
        record: records.get(old.name) ?? {},
        raw: {
          ...old.raw,
          _skillBypass:
            cap !== undefined && num(obj(player.socialStats).craftskill) >= cap,
        },
      };
      recipes.push(next);
      for (const [tier, output] of Object.entries(next.outputs))
        source({
          id: `recipe:${next.name}:${tier}`,
          item: output.name,
          label: `${items.get(next.name)?.label ?? next.name} · ${tier === "basic" ? "Normal" : tier === "perfect" ? "Perfect" : "Sublime"}`,
          location: "Crafting",
          kind: "recipe",
          availability: next.known ? "available" : "locked",
          repeatable: true,
          quantity: output.quantity,
          reason: next.known ? undefined : "Recipe not known",
        });
    }
  } else {
    const recipeDefs = [...items.values()].filter((i) => i.kind === "recipe");
    for (const item of recipeDefs) {
      let raw = item.raw,
        perfection: number | undefined,
        completion: number | undefined,
        error: string | undefined;
      try {
        if (!reader) throw new Error("Effective recipe access is unavailable.");
        const effective = reader.read(raw, flags);
        raw = effective.recipe;
        perfection = num(effective.stats.perfection) || undefined;
        completion = num(effective.stats.completion) || undefined;
      } catch (e) {
        error = e instanceof Error ? e.message : "Effective recipe unavailable";
      }
      const outputs: Recipe["outputs"] = {};
      for (const tier of ["basic", "perfect", "sublime"] as Tier[]) {
        const desc = obj(raw[tier === "basic" ? "baseItem" : `${tier}Item`]);
        const output = addItem(desc);
        if (output)
          outputs[tier] = {
            name: output.name,
            quantity: num(desc.stacks, 1),
            raw: output.raw,
          };
      }
      const ingredients: Ingredient[] = list(raw.ingredients)
        .map((i) => {
          const desc = obj(i.item);
          addItem(desc);
          return { name: str(desc.name), quantity: num(i.quantity) };
        })
        .filter((i) => i.name && i.quantity > 0);
      let skillBypass = false;
      try {
        const cap = api.utils.getCraftSkillCap?.(
          str(raw.realm),
          str(raw.realmProgress),
        );
        skillBypass =
          cap !== undefined && num(obj(player.socialStats).craftskill) >= cap;
      } catch {
        /* unknown is not a skill bypass */
      }
      const recipe: Recipe = {
        name: item.name,
        raw: { ...raw, _skillBypass: skillBypass },
        ingredients,
        outputs,
        known: records.has(item.name),
        record: records.get(item.name) ?? {},
        perfection,
        completion,
        error,
      };
      recipes.push(recipe);
      for (const [tier, output] of Object.entries(outputs))
        source({
          id: `recipe:${item.name}:${tier}`,
          item: output.name,
          label: `${item.label} · ${tier === "basic" ? "Normal" : tier === "perfect" ? "Perfect" : "Sublime"}`,
          location: "Crafting",
          kind: "recipe",
          availability: recipe.known ? "available" : "locked",
          repeatable: true,
          quantity: output.quantity,
          reason: recipe.known ? undefined : "Recipe not known",
        });
    }
  }
  const inventory: InventoryEntry[] = [];
  if (previous && !plan.inventory) inventory.push(...previous.inventory);
  else {
    for (const place of ["inventory", "storage"] as const) {
      for (const entry of list(
        inventoryState[place === "inventory" ? "items" : "storage"],
      )) {
        const item = addItem(entry);
        if (!item) continue;
        inventory.push({
          key: variantKey(entry),
          name: item.name,
          label: item.label,
          quantity: Math.max(0, num(entry.stacks)),
          place,
          raw: entry,
        });
      }
    }
  }
  const charisma =
    previous && (!plan.markets || plan.prices === false)
      ? previous.charisma
      : effectiveCharisma(api, player, obj(state.breakthrough));
  let passives: Raw[] = [],
    passivesResolved = !!api.utils.getDestinies;
  try {
    if (!previous || (plan.markets && plan.prices !== false))
      passives = (api.utils.getDestinies?.(player) ?? []).map(obj);
  } catch {
    passivesResolved = false;
    issues.push("Market passive bonuses are unresolved.");
  }
  const acquires = (item: Item): "inventory" | "knowledge" =>
    ["recipe", "action", "manual"].includes(item.kind) ||
    (item.kind === "technique" && item.raw.subKind === "technique")
      ? "knowledge"
      : "inventory";
  const visited = new Set(
    Array.isArray(locationState.visited) ? locationState.visited : [],
  );
  if (str(locationState.current)) visited.add(locationState.current);
  const known = new Set(visited);
  for (const id of previous?.knownLocations ?? []) known.add(id);
  if ((!previous || plan.sources) && api.utils.discoverUnlockedLocations) {
    // Recompute discovery on access changes; stock/price updates reuse knowledge.
    for (const id of known) if (!visited.has(id)) known.delete(id);
    try {
      const discovered: Raw[] = [];
      api.utils.discoverUnlockedLocations(flags, discovered);
      for (const location of discovered)
        if (str(location.name)) known.add(location.name);
    } catch {
      /* Fall back to confirmed visits. */
    }
  }
  const availability = (location: string, disabled: unknown): Availability => {
    const denied = disabled === undefined ? false : condition(disabled);
    return denied === true
      ? "locked"
      : denied === undefined
        ? "unknown"
        : known.has(location)
          ? "available"
          : "possible";
  };
  const buildingStatus = new Map<string, Availability>();
  const indexedMarkets = new Set<string>();
  const labelCounts = new Map<string, number>();
  if (!previous || plan.sources)
    for (const [id, raw] of Object.entries(locations)) {
      const location = obj(raw),
        label = translate(location.displayName ?? location.name ?? id);
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  for (const [locationId, locationValue] of Object.entries(locations)) {
    if (
      previous &&
      !plan.sources &&
      plan.markets !== true &&
      !(plan.markets instanceof Set && plan.markets.has(locationId))
    )
      continue;
    const location = obj(locationValue),
      displayName = translate(
        location.displayName ?? location.name ?? locationId,
      ),
      canonicalName = translate(locationId),
      locationName =
        (labelCounts.get(displayName) ?? 0) > 1 && canonicalName !== displayName
          ? `${displayName} · ${canonicalName}`
          : previous && !plan.sources
            ? (previous.markets.find((m) => m.id === locationId)?.name ??
              displayName)
            : displayName;
    for (const building of list(location.buildings)) {
      const status = availability(locationId, building.disabled);
      buildingStatus.set(`${locationId}:${str(building.kind)}`, status);
      if (plan.sources && building.kind === "recipe") {
        for (const names of Object.values(obj(building.recipePool)))
          for (const name of Array.isArray(names) ? names : []) {
            const item = addItem({ name });
            if (item)
              source({
                id: `library:${locationId}:${item.name}`,
                item: item.name,
                label: "Recipe library",
                location: locationName,
                kind: "reward",
                availability: status,
                repeatable: false,
                currency: "favour",
              });
          }
      }
      if (building.kind !== "market") continue;
      if (
        previous &&
        plan.markets !== true &&
        !(plan.markets instanceof Set && plan.markets.has(locationId))
      )
        continue;
      // The native market view uses the first market building for this location.
      if (indexedMarkets.has(locationId)) continue;
      indexedMarkets.add(locationId);
      if (building.tokenCurrency) {
        for (const entries of Object.values(
          obj(obj(building.tokenCurrency).tokenStock),
        ))
          for (const entry of list(entries)) {
            const item = addItem(obj(entry.item));
            if (item)
              source({
                id: `token:${locationId}:${item.name}`,
                item: item.name,
                label: locationName,
                location: locationName,
                kind: "buy",
                availability: status,
                repeatable: true,
                currency: str(
                  obj(obj(building.tokenCurrency).currencyItem).name,
                ),
                cost: missing(
                  "Token currency is not converted to spirit stones.",
                  "unavailable",
                ),
              });
          }
        continue;
      }
      const group = str(location.reputationName),
        reputation = num(obj(player.reputation)[group]);
      const bonus = passivesResolved
        ? Math.floor(reputation / 5) * 0.05 +
          passives.reduce(
            (sum, p) => sum + num(obj(p.locationDiscount)[group]),
            0,
          )
        : NaN;
      const market: Market = (previous && plan.prices === false
        ? previous.markets.find((m) => m.id === locationId)
        : undefined) ?? {
        id: locationId,
        name: locationName,
        availability: status,
        bonus,
        multiplier: num(building.costMultiplier, 1),
        raw: building,
        known: known.has(locationId),
        reason:
          status === "possible"
            ? "Market access has not been confirmed."
            : status === "locked"
              ? "Market is locked."
              : undefined,
      };
      markets.push(market);
      const marketState = obj(
        obj(obj(obj(locationState.locations)[locationId]).buildingState).market,
      );
      const current = list(marketState.items),
        knownStock = Array.isArray(marketState.items);
      const definitions = Object.values(obj(building.itemPool))
        .flatMap(list)
        .concat(Object.values(obj(building.reputationPool)).flatMap(list));
      const all = new Map<string, Raw>();
      for (const entry of definitions) all.set(str(entry.name), entry);
      for (const entry of current) all.set(str(entry.name), entry);
      for (const [name, definition] of all) {
        const item = addItem(definition);
        if (!item) continue;
        const stocked = current.filter((e) => e.name === name);
        for (const [entryIndex, entry] of (stocked.length
          ? stocked
          : [definition]
        ).entries()) {
          const quantity = stocked.length ? Math.max(0, num(entry.stacks)) : 0;
          const reputationTiers: Record<string, number> = {
            neutral: 0,
            friendly: 5,
            respected: 10,
            honoured: 15,
            revered: 20,
            exalted: 25,
          };
          // Unknown reputation labels are not guessed. Numeric requirement is accepted.
          const repLabel = str(entry.reputation).toLowerCase();
          const repThreshold =
            typeof entry.reputation === "number"
              ? entry.reputation
              : repLabel
                ? reputationTiers[repLabel]
                : undefined;
          let access = status;
          const allowed = condition(definition.condition);
          if (allowed === false) access = "locked";
          else if (allowed === undefined) access = "unknown";
          if (repLabel && repThreshold === undefined) access = "unknown";
          else if (repThreshold !== undefined && reputation < repThreshold)
            access = "locked";
          if (access === "available")
            access = !knownStock
              ? "unknown"
              : quantity <= 0
                ? "exhausted"
                : "available";
          let discount: number | undefined;
          const priorQuote =
            plan.prices === false
              ? previous?.sources
                  .get(name)
                  ?.find(
                    (s) =>
                      s.id === `market:${locationId}:${name}:${entryIndex}`,
                  )
              : undefined;
          const reusePrice =
            priorQuote?.cost?.state === "value" &&
            ["valueModifier", "harmonyAugment", "enchantment"].every(
              (key) =>
                JSON.stringify(priorQuote.raw?.[key]) ===
                JSON.stringify(entry[key]),
            );
          try {
            if (!reusePrice && charisma !== undefined)
              discount = api.utils.getCharismaDiscount?.(charisma, item.realm);
          } catch {
            /* unresolved */
          }
          const quotedItem = {
            ...item.raw,
            harmonyAugment: entry.harmonyAugment,
            enchantment: entry.enchantment,
          };
          const cost = reusePrice
            ? priorQuote!.cost!
            : pricingVerified
              ? purchasePrice(
                  quotedItem,
                  market,
                  num(entry.valueModifier, 1),
                  discount,
                )
              : missing(
                  "Price adapter has not been verified for this game version.",
                );
          source({
            id: `market:${locationId}:${name}:${entryIndex}`,
            item: name,
            label: locationName,
            location: locationName,
            kind: "buy",
            availability: access,
            quantity: knownStock ? quantity : undefined,
            repeatable: true,
            currency: "Spirit Stones",
            cost,
            reason:
              access === "unknown"
                ? "Stock or access is unresolved."
                : access === "exhausted"
                  ? "Out of stock."
                  : access === "locked"
                    ? "Purchase requirements are not met."
                    : market.reason,
            raw: entry,
            acquires: acquires(item),
            marketId: locationId,
            stockItem: quotedItem,
          });
        }
      }
    }
    if (plan.sources)
      for (const encounter of list(location.enemies)) {
        const enemy = obj(encounter.enemy);
        for (const drop of list(enemy.drops)) {
          const item = addItem(obj(drop.item));
          if (!item) continue;
          const conditionResult = condition(drop.condition),
            status = availability(locationId, undefined);
          source({
            id: `combat:${locationId}:${str(enemy.name)}:${item.name}`,
            item: item.name,
            label: str(enemy.name, "Combat"),
            location: locationName,
            kind: "farm",
            availability:
              conditionResult === false
                ? "locked"
                : conditionResult === undefined
                  ? "unknown"
                  : status,
            repeatable: true,
            quantity: num(drop.amount, 1),
            reason: `Drop chance: ${num(drop.chance, 1) * 100}%`,
            raw: drop,
            acquires: acquires(item),
          });
        }
      }
  }
  if (plan.sources) {
    const gardenLocations = [...Object.entries(locations)].filter(([, loc]) =>
      list(obj(loc).buildings).some((b) => b.kind === "herbField"),
    );
    for (const [realm, crops] of Object.entries(obj(data.crops)))
      for (const crop of list(crops)) {
        const item = addItem({ name: crop.item });
        if (!item) continue;
        for (const [id, loc] of gardenLocations) {
          const status = buildingStatus.get(`${id}:herbField`) ?? "unknown";
          source({
            id: `crop:${id}:${realm}:${item.name}`,
            item: item.name,
            label: "Herb garden",
            location: translate(obj(loc).displayName ?? id),
            kind: "farm",
            availability:
              REALMS.indexOf(realm) > REALMS.indexOf(str(player.realm))
                ? "locked"
                : crop.cost
                  ? "possible"
                  : status,
            repeatable: true,
            quantity: num(crop.yield, 1),
            reason: crop.cost
              ? `Requires ${str(crop.cost)}; crop prerequisites need confirmation.`
              : undefined,
            raw: crop,
          });
        }
      }
    for (const mine of Object.values(obj(data.mineConfigs)).map(obj)) {
      const loc = str(mine.locationName),
        mineStatus = buildingStatus.get(`${loc}:mine`) ?? "possible";
      for (const [realm, progression] of Object.entries(obj(mine.chambers)))
        for (const [progress, chambers] of Object.entries(obj(progression)))
          for (const chamber of list(chambers)) {
            const entries =
              chamber.kind === "ore"
                ? list(chamber.ores).map((e) => ({ name: str(e.item), raw: e }))
                : chamber.kind === "vein"
                  ? [{ name: str(chamber.ore), raw: chamber }]
                  : chamber.kind === "random"
                    ? list(chamber.items).map((e) => ({
                        name: str(obj(e.item).name),
                        raw: e,
                      }))
                    : [];
            for (const entry of entries) {
              const item = addItem({ name: entry.name });
              if (!item) continue;
              source({
                id: `mine:${str(mine.id)}:${realm}:${progress}:${str(chamber.name)}:${item.name}`,
                item: item.name,
                label: `${str(chamber.name, "Mine")} · ${realm} ${progress}`,
                location: loc,
                kind: chamber.isUnique ? "reward" : "farm",
                availability:
                  condition(chamber.condition) === false
                    ? "locked"
                    : mineStatus === "locked"
                      ? "locked"
                      : "possible",
                repeatable: !chamber.isUnique,
                reason:
                  "Potential chamber; current depth and generation are not yet resolved.",
                raw: entry.raw,
              });
            }
          }
    }
  }
  const byOutput = new Map<string, Recipe[]>();
  if (!previous || recipeWork)
    for (const recipe of recipes)
      for (const name of new Set(
        Object.values(recipe.outputs).map((o) => o.name),
      )) {
        const all = byOutput.get(name) ?? [];
        all.push(recipe);
        byOutput.set(name, all);
      }
  const failed = recipes.filter((r) => r.error).length;
  if (failed)
    issues.push(
      `${failed} recipes have unresolved effective ingredients or thresholds.`,
    );
  issues.push(
    "Specialized shops, event rewards and current mine/garden prerequisites are not yet complete. Unconfirmed sources do not fund calculations.",
  );
  return {
    items,
    knownLocations: previous && !plan.sources ? previous.knownLocations : known,
    recipes: previous && !recipeWork ? previous.recipes : recipes,
    recipesByOutput:
      previous && !recipeWork ? previous.recipesByOutput : byOutput,
    sources,
    markets:
      previous && (!plan.markets || plan.prices === false)
        ? previous.markets
        : markets,
    inventory: previous && !plan.inventory ? previous.inventory : inventory,
    player,
    flags,
    charisma,
    revision,
    issues,
    gameVersion: version,
    pricingVerified,
  };
}
