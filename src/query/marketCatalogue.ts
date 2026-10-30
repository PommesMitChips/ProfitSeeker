import {
  Item,
  Market,
  Metric,
  Source,
  World,
  missing,
  num,
  obj,
  value,
} from "../domain/model";

export interface MarketCatalogue {
  byMarket: Map<string, Source[]>;
  byItem: Map<string, Source[]>;
}
const cached = new WeakMap<
  World,
  {
    catalogue: MarketCatalogue;
    sources: World["sources"];
    markets: World["markets"];
    sourceCount: number;
    marketCount: number;
  }
>();

/** Purchase membership comes only from registered stock pools or observed stock.
 * Sale-price quotes must never manufacture a purchase listing. */
export function marketCatalogue(world: World): MarketCatalogue {
  const prior = cached.get(world);
  if (
    prior &&
    prior.sources === world.sources &&
    prior.markets === world.markets &&
    prior.sourceCount === world.sources.size &&
    prior.marketCount === world.markets.length
  )
    return prior.catalogue;
  const markets = new Map(world.markets.map((m) => [m.id, m]));
  const result: MarketCatalogue = { byMarket: new Map(), byItem: new Map() };
  const seen = new Set<string>();
  for (const sources of world.sources.values())
    for (const source of sources) {
      const market = source.marketId ? markets.get(source.marketId) : undefined;
      if (
        source.kind !== "buy" ||
        source.currency !== "Spirit Stones" ||
        !market ||
        market.known === false ||
        (market.known === undefined && market.availability === "possible") ||
        seen.has(source.id)
      )
        continue;
      seen.add(source.id);
      result.byMarket.set(market.id, [
        ...(result.byMarket.get(market.id) ?? []),
        source,
      ]);
      result.byItem.set(source.item, [
        ...(result.byItem.get(source.item) ?? []),
        source,
      ]);
    }
  cached.set(world, {
    catalogue: result,
    sources: world.sources,
    markets: world.markets,
    sourceCount: world.sources.size,
    marketCount: world.markets.length,
  });
  return result;
}
export const purchaseListings = (world: World, name: string): Source[] =>
  marketCatalogue(world).byItem.get(name) ?? [];
export const stocked = (source: Source): boolean =>
  source.availability === "available" && (source.quantity ?? 0) >= 1;

/** Compare the same star/enchantment price variant as the crafting row. */
export function itemPurchaseListings(
  world: World,
  item: Item,
  quality = num(obj(item.raw.harmonyAugment).quality),
): Source[] {
  return purchaseListings(world, item.name).filter((s) => {
    const raw = s.stockItem ?? item.raw;
    return (
      num(obj(raw.harmonyAugment).quality) === quality &&
      JSON.stringify(obj(raw.enchantment)) ===
        JSON.stringify(obj(item.raw.enchantment))
    );
  });
}
export function purchaseMetric(sources: Source[]): Metric {
  const prices = sources
    .filter(stocked)
    .flatMap((s) => (s.cost?.state === "value" ? [s.cost.value] : []));
  if (prices.length) return value(Math.min(...prices));
  return missing(
    "No confirmed purchase stock for this item.",
    sources.some(
      (s) =>
        s.availability === "unknown" ||
        (stocked(s) && s.cost?.state === "unknown"),
    )
      ? "unknown"
      : "unavailable",
  );
}
export function uniqueMarkets(markets: Market[]): Market[] {
  return [...new Map(markets.map((m) => [m.id, m])).values()];
}
