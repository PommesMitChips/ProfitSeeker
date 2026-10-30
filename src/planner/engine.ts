import {
  Alternative,
  Item,
  Metric,
  Options,
  Output,
  Preferences,
  Raw,
  Recipe,
  Route,
  Row,
  Step,
  Tier,
  World,
  missing,
  num,
  value,
} from "../domain/model";
import {
  finance,
  resolveOutput,
  resolveItemOutput,
} from "../mechanics/results";
import { salePrice } from "../mechanics/pricing";
import {
  purchaseListings,
  itemPurchaseListings,
  purchaseMetric,
  uniqueMarkets,
} from "../query/marketCatalogue";
/** Upper bound on replacement-cost savings. Refunds never fund initial inputs.
 * Only directly purchased ingredient units have an attributable cash basis. */
export function refundCredit(
  recipe: Recipe,
  output: Output,
  steps: Step[],
  batches: number,
): number {
  // Nested crafting consumes purchased materials too. Until each ingredient has
  // its own cost provenance, do not attribute those purchases to outer refunds.
  if (steps.filter((s) => s.kind === "craft").length > 1) return 0;
  const units: { quantity: number; price: number }[] = [];
  for (const ingredient of recipe.ingredients) {
    let remaining = ingredient.quantity * batches;
    for (const step of steps
      .filter((s) => s.kind === "buy" && s.item === ingredient.name)
      .sort((a, b) => b.cost / b.quantity - a.cost / a.quantity)) {
      const quantity = Math.min(remaining, step.quantity);
      if (quantity > 0)
        units.push({ quantity, price: step.cost / step.quantity });
      remaining -= quantity;
    }
  }
  let remaining = (output.refundMax ?? 0) * batches,
    credit = 0;
  for (const unit of units.sort((a, b) => b.price - a.price)) {
    const count = Math.min(remaining, unit.quantity);
    credit += count * unit.price;
    remaining -= count;
  }
  return credit;
}
export function routeCost(route: Route): Metric {
  const upper = route.cost / route.quantity;
  const lower =
    Math.max(0, route.cost - (route.refundCreditMax ?? 0)) / route.quantity;
  return lower < upper ? { state: "value", value: upper, lower } : value(upper);
}
interface Ledger {
  held: Map<string, number>;
  owned: Map<string, number>;
  stock: Map<string, number>;
  cost: number;
  steps: Step[];
}
const clone = (s: Ledger): Ledger => ({
  held: new Map(s.held),
  owned: new Map(s.owned),
  stock: new Map(s.stock),
  cost: s.cost,
  steps: [...s.steps],
});
export function usableInventory(
  world: World,
  reserved: Record<string, number>,
): Map<string, number> {
  const result = new Map<string, number>(),
    remaining = new Map(Object.entries(reserved));
  for (const entry of world.inventory) {
    const withheld = Math.min(
      entry.quantity,
      Math.max(0, remaining.get(entry.key) ?? 0),
    );
    remaining.set(
      entry.key,
      Math.max(0, (remaining.get(entry.key) ?? 0) - withheld),
    );
    result.set(
      entry.name,
      (result.get(entry.name) ?? 0) + entry.quantity - withheld,
    );
  }
  return result;
}
export class Planner {
  private work = 0;
  limited = false;
  constructor(
    private world: World,
    private options: Options,
    private knownOnly: boolean,
    private reservations: Record<string, number>,
    private limit = 6000,
  ) {}
  private tick(): boolean {
    if (++this.work > this.limit) {
      this.limited = true;
      return false;
    }
    return true;
  }
  private initial(): Ledger {
    const owned = this.options.inventory
      ? usableInventory(this.world, this.reservations)
      : new Map<string, number>();
    return {
      owned,
      held: this.options.inventory
        ? usableInventory(this.world, this.reservations)
        : new Map(),
      stock: new Map(),
      cost: 0,
      steps: [],
    };
  }
  private candidates(name: string): { recipe: Recipe; output: Output }[] {
    const result: { recipe: Recipe; output: Output }[] = [];
    for (const recipe of this.world.recipesByOutput.get(name) ?? []) {
      if (this.knownOnly && !recipe.known) continue;
      for (const tier of ["basic", "perfect", "sublime"] as Tier[]) {
        if (
          (
            recipe.outputs[tier] ??
            (tier === "sublime" ? recipe.outputs.perfect : undefined)
          )?.name !== name
        )
          continue;
        const output = resolveOutput(recipe, tier, "achieved", this.world);
        if (output) result.push({ recipe, output });
      }
    }
    return result;
  }
  private prune(states: Ledger[]): Ledger[] {
    const seen = new Map<string, Ledger>();
    for (const state of states) {
      const key = JSON.stringify([
        [...state.held].filter(([, v]) => v).sort(),
        [...state.owned].filter(([, v]) => v).sort(),
        [...state.stock].filter(([, v]) => v).sort(),
      ]);
      const old = seen.get(key);
      if (!old || state.cost < old.cost) seen.set(key, state);
    }
    return [...seen.values()];
  }
  private ingredients(
    recipe: Recipe,
    start: Ledger,
    path: Set<string>,
  ): Ledger[] {
    let states = [start];
    for (const ingredient of recipe.ingredients) {
      states = this.prune(
        states.flatMap((s) =>
          this.supply(ingredient.name, ingredient.quantity, s, path),
        ),
      );
      if (!states.length) break;
    }
    return states;
  }
  private purchase(name: string, count: number, state: Ledger): Ledger[] {
    if (!this.options.buy) return [];
    const sources = purchaseListings(this.world, name).filter(
      (s) =>
        s.kind === "buy" &&
        s.acquires !== "knowledge" &&
        s.availability === "available" &&
        s.currency === "Spirit Stones" &&
        s.cost?.state === "value",
    );
    const ordered = [...sources].sort(
      (a, b) =>
        (a.cost?.state === "value" ? a.cost.value : Infinity) -
          (b.cost?.state === "value" ? b.cost.value : Infinity) ||
        a.id.localeCompare(b.id),
    );
    const results: Ledger[] = [];
    // Cheapest bounded allocation is optimal among purchases of this fungible item.
    // Single-market alternatives remain available for the cost hover as well.
    for (const group of [ordered, ...ordered.map((s) => [s])]) {
      let need = count;
      const next = clone(state);
      for (const source of group) {
        const left = Math.max(
          0,
          (source.quantity ?? 0) - (next.stock.get(source.id) ?? 0),
        );
        const take = Math.min(left, need);
        if (take <= 0 || source.cost?.state !== "value") continue;
        next.stock.set(source.id, (next.stock.get(source.id) ?? 0) + take);
        const cost = take * source.cost.value;
        next.cost += cost;
        need -= take;
        next.steps.push({
          kind: "buy",
          item: name,
          quantity: take,
          label: source.label,
          cost,
        });
        if (need <= 0) break;
      }
      if (need <= 0) results.push(next);
    }
    return this.prune(results);
  }
  private supply(
    name: string,
    count: number,
    state: Ledger,
    path: Set<string>,
  ): Ledger[] {
    if (!this.tick()) return [];
    const current = clone(state),
      held = Math.min(count, current.held.get(name) ?? 0);
    if (held > 0) {
      current.held.set(name, (current.held.get(name) ?? 0) - held);
      const owned = Math.min(held, current.owned.get(name) ?? 0);
      current.owned.set(name, (current.owned.get(name) ?? 0) - owned);
      if (owned > 0)
        current.steps.push({
          kind: "inventory",
          item: name,
          quantity: owned,
          label: "Owned, unreserved ingredients",
          cost: 0,
        });
      if (held > owned)
        current.steps.push({
          kind: "intermediate",
          item: name,
          quantity: held - owned,
          label: "Output from an earlier craft in this plan",
          cost: 0,
        });
      count -= held;
    }
    if (count <= 0) return [current];
    const results: Ledger[] = [];
    if (this.options.farm) {
      const farm = (this.world.sources.get(name) ?? []).find(
        (s) =>
          s.kind === "farm" &&
          s.acquires !== "knowledge" &&
          s.repeatable &&
          s.availability === "available",
      );
      if (farm) {
        const next = clone(current);
        next.steps.push({
          kind: "farm",
          item: name,
          quantity: count,
          label: `${farm.label} · ${farm.location}`,
          sourceLabel: farm.label,
          sourceLocation: farm.location,
          cost: 0,
        });
        results.push(next);
      }
    }
    results.push(...this.purchase(name, count, current));
    const recipes = this.candidates(name).filter(
      (c) => !path.has(c.recipe.name),
    );
    for (const candidate of recipes) {
      if (!this.tick()) break;
      const nested = new Set(path).add(candidate.recipe.name);
      for (const paid of this.ingredients(candidate.recipe, current, nested)) {
        paid.steps.push({
          kind: "craft",
          item: name,
          quantity: candidate.output.quantity,
          label: candidate.recipe.name,
          cost: 0,
          recipe: candidate.recipe.name,
          output: candidate.output,
        });
        paid.held.set(
          name,
          (paid.held.get(name) ?? 0) + candidate.output.quantity,
        );
        results.push(...this.supply(name, count, paid, path));
      }
    }
    // Mixed purchase/craft routes: enumerate purchased quantities, with an explicit
    // work bound. Truncation is reported, never presented as a proven optimum.
    if (recipes.length && this.options.buy)
      for (let bought = 1; bought < count; bought++) {
        if (!this.tick()) break;
        for (const paid of this.purchase(name, bought, current)) {
          for (const candidate of recipes) {
            const nested = new Set(path).add(candidate.recipe.name);
            for (const crafted of this.ingredients(
              candidate.recipe,
              paid,
              nested,
            )) {
              crafted.steps.push({
                kind: "craft",
                item: name,
                quantity: candidate.output.quantity,
                label: candidate.recipe.name,
                cost: 0,
                recipe: candidate.recipe.name,
                output: candidate.output,
              });
              crafted.held.set(
                name,
                (crafted.held.get(name) ?? 0) + candidate.output.quantity,
              );
              results.push(...this.supply(name, count - bought, crafted, path));
            }
          }
        }
      }
    return this.prune(results);
  }
  routes(item: Item, desired = 1): Route[] {
    if (!Number.isSafeInteger(desired) || desired < 1) return [];
    const recipes = this.world.recipesByOutput.get(item.name) ?? [];
    if (!recipes.length)
      return this.supply(item.name, desired, this.initial(), new Set()).map(
        (s, i) => ({
          id: `direct:${i}`,
          cost: s.cost,
          quantity: desired,
          steps: s.steps,
          basis: "Direct acquisition",
          quality: num((item.raw.harmonyAugment as Raw | undefined)?.quality),
        }),
      );
    const routes: Route[] = [];
    for (const recipe of recipes) {
      if (this.knownOnly && !recipe.known) continue;
      const output = resolveItemOutput(
        recipe,
        item.name,
        this.options.tier,
        this.options.quality,
        this.world,
      );
      if (!output) continue;
      const batches = Math.ceil(desired / output.quantity);
      const complete = {
        ...recipe,
        ingredients: recipe.ingredients.map((i) => ({
          ...i,
          quantity: i.quantity * batches,
        })),
      };
      for (const s of this.ingredients(
        complete,
        this.initial(),
        new Set([recipe.name]),
      )) {
        s.steps.push({
          kind: "craft",
          item: item.name,
          quantity: output.quantity * batches,
          label: recipe.name,
          cost: 0,
          recipe: recipe.name,
          output,
        });
        routes.push({
          id: `${recipe.name}:${output.tier}:${routes.length}`,
          cost: s.cost,
          refundCreditMax: refundCredit(recipe, output, s.steps, batches),
          quantity: output.quantity * batches,
          steps: s.steps,
          basis: output.basis,
          quality: output.quality,
          output,
          recipe,
        });
      }
    }
    return routes.sort(
      (a, b) =>
        a.cost / a.quantity - b.cost / b.quantity || a.id.localeCompare(b.id),
    );
  }
}
export function evaluateRow(
  item: Item,
  world: World,
  prefs: Preferences,
  desired = 1,
): Row {
  const planner = new Planner(
    world,
    prefs.options,
    prefs.filters.known,
    prefs.reservations,
  );
  const routes = planner.routes(item, desired);
  const recipes = world.recipesByOutput.get(item.name) ?? [];
  const scenarios = recipes
    .map((r) =>
      resolveItemOutput(
        r,
        item.name,
        prefs.options.tier,
        prefs.options.quality,
        world,
      ),
    )
    .filter((o): o is Output => !!o);
  const unsupported = recipes.length > 0 && scenarios.length === 0;
  const fallbackQuality =
    world.recipesByOutput.has(item.name) && prefs.options.quality !== "achieved"
      ? prefs.options.quality
      : num((item.raw.harmonyAugment as Raw | undefined)?.quality);
  const alternatives: Alternative[] = [];
  for (const route of routes)
    for (const market of uniqueMarkets(world.markets)) {
      if (market.availability !== "available" || !world.pricingVerified)
        continue;
      const price = salePrice(item, market, route.quality);
      if (price.state !== "value") continue;
      const cost = route.cost / route.quantity,
        { profit, roi } = finance(cost, price.value);
      alternatives.push({
        route,
        quote: {
          market: market.name,
          marketId: market.id,
          availability: "available",
          price,
        },
        cost,
        sale: price.value,
        profit,
        roi,
      });
    }
  alternatives.sort(
    (a, b) =>
      b.profit - a.profit ||
      a.cost - b.cost ||
      a.quote.market.localeCompare(b.quote.market),
  );
  const best = alternatives[0];
  const quoteQuality =
    best?.route.quality ??
    routes[0]?.quality ??
    scenarios[0]?.quality ??
    fallbackQuality;
  const purchases = itemPurchaseListings(world, item, quoteQuality);
  const quotes = uniqueMarkets(world.markets).map((m) => ({
    market: m.name,
    marketId: m.id,
    availability: m.availability,
    reason: m.reason,
    price: unsupported
      ? missing(
          "This item does not support the selected crafting result.",
          "unavailable",
        )
      : world.pricingVerified
        ? salePrice(item, m, quoteQuality)
        : missing("Price rules are not verified for this game version."),
  }));
  const sourceUnknown = (world.sources.get(item.name) ?? []).some(
    (s) => s.availability === "unknown" || s.cost?.state === "unknown",
  );
  const why = planner.limited
    ? "The route search limit was reached; a cheapest route has not been established."
    : !routes.length
      ? "No complete route supports this result with the permitted sources."
      : !best
        ? "No available market has a verified sale quote."
        : undefined;
  const validSale = quotes
    .filter((q) => q.availability === "available" && q.price.state === "value")
    .sort(
      (a, b) =>
        (b.price.state === "value" ? b.price.value : 0) -
        (a.price.state === "value" ? a.price.value : 0),
    )[0]?.price;
  let unavailable: Metric = missing(
    why ?? "Unresolved calculation.",
    sourceUnknown ? "unknown" : "unavailable",
  );
  if (planner.limited) unavailable = missing(why!);
  return {
    item,
    buy: purchaseMetric(purchases),
    purchases,
    cost: planner.limited
      ? unavailable
      : routes[0]
        ? routeCost(best?.route ?? routes[0])
        : unavailable,
    sale: unsupported
      ? missing(
          "This item does not support the selected crafting result.",
          "unavailable",
        )
      : best
        ? value(best.sale)
        : (validSale ?? missing("No available verified sale quote.")),
    profit: best && !planner.limited ? value(best.profit) : unavailable,
    roi:
      best && !planner.limited
        ? best.roi === undefined
          ? { state: "undefined", reason: "No spirit-stone investment." }
          : value(best.roi)
        : unavailable,
    route: best?.route ?? routes[0],
    quotes,
    alternatives,
    reason: why,
    complete: !planner.limited,
  };
}

export function canCraftNow(
  item: Item,
  world: World,
  reservations: Record<string, number>,
): boolean {
  const key = JSON.stringify([item.name, reservations]);
  const stamp = world.revisions
    ? `${world.revisions.all}:${world.revisions.items.get(item.name) ?? 0}`
    : "";
  if (world.memo?.craftability.get(key)?.stamp === stamp)
    return world.memo.craftability.get(key)!.value;
  const remember = (value: boolean) => {
    world.memo?.craftability.set(key, { stamp, value });
    return value;
  };
  if (!world.recipesByOutput.has(item.name)) return remember(false);
  for (const tier of ["basic", "perfect", "sublime"] as Tier[]) {
    const planner = new Planner(
      world,
      { tier, quality: "achieved", buy: false, farm: false, inventory: true },
      true,
      reservations,
      2000,
    );
    if (planner.routes(item).length) return remember(true);
  }
  return remember(false);
}
