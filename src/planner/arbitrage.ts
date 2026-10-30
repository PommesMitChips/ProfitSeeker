import {
  Alternative,
  Item,
  Row,
  Source,
  World,
  missing,
  num,
  obj,
  value,
} from "../domain/model";
import { salePrice, saleable } from "../mechanics/pricing";
import { finance } from "../mechanics/results";
import { variantKey } from "../catalogue/readWorld";
import { marketCatalogue, uniqueMarkets } from "../query/marketCatalogue";
export interface ArbitrageRow extends Row {
  offers: Source[];
}
const cachedRows = new WeakMap<World, ArbitrageRow[]>();
export function cachedArbitrageRows(world: World): ArbitrageRow[] {
  const cached = cachedRows.get(world);
  if (cached) return cached;
  const rows = arbitrageRows(world);
  cachedRows.set(world, rows);
  return rows;
}
export function arbitrageRows(world: World): ArbitrageRow[] {
  const groups = new Map<string, { item: Item; offers: Source[] }>();
  for (const sources of marketCatalogue(world).byItem.values())
    for (const source of sources) {
      if (
        source.kind !== "buy" ||
        source.currency !== "Spirit Stones" ||
        source.acquires === "knowledge" ||
        source.availability !== "available" ||
        !(source.quantity && source.quantity >= 1)
      )
        continue;
      const base = world.items.get(source.item);
      if (!base) continue;
      const raw = source.stockItem ?? {
        ...base.raw,
        harmonyAugment: source.raw?.harmonyAugment,
        enchantment: source.raw?.enchantment,
      };
      if (!saleable(raw)) continue;
      const key = variantKey(raw);
      const group = groups.get(key) ?? {
        item: { ...base, key, raw },
        offers: [],
      };
      group.offers.push(source);
      groups.set(key, group);
    }
  return [...groups.values()].map(({ item, offers }) => {
    const quotes = uniqueMarkets(world.markets).map((m) => ({
      market: m.name,
      marketId: m.id,
      availability: m.availability,
      reason: m.reason,
      price: world.pricingVerified
        ? salePrice(item, m)
        : missing("Price rules are not verified for this game version."),
    }));
    const alternatives: Alternative[] = [];
    if (world.pricingVerified)
      for (const s of offers) {
        if (
          s.availability !== "available" ||
          s.cost?.state !== "value" ||
          !s.quantity ||
          s.quantity < 1
        )
          continue;
        for (const quote of quotes) {
          if (
            quote.availability !== "available" ||
            quote.price.state !== "value"
          )
            continue;
          const cost = s.cost.value,
            sale = quote.price.value;
          alternatives.push({
            route: {
              id: s.id,
              cost,
              quantity: 1,
              quality: num(obj(item.raw.harmonyAugment).quality),
              basis: "Buy and resell the same item",
              steps: [
                {
                  kind: "buy",
                  item: item.name,
                  quantity: 1,
                  label: s.location,
                  cost,
                },
              ],
            },
            quote,
            cost,
            sale,
            ...finance(cost, sale),
          });
        }
      }
    alternatives.sort(
      (a, b) =>
        b.profit - a.profit ||
        a.cost - b.cost ||
        a.route.id.localeCompare(b.route.id) ||
        a.quote.market.localeCompare(b.quote.market),
    );
    const best = alternatives[0],
      unknown = offers.some(
        (s) => s.availability === "unknown" || s.cost?.state === "unknown",
      );
    const unavailable = missing(
      "No confirmed in-stock purchase and sale pair in the selected known markets.",
      unknown ? "unknown" : "unavailable",
    );
    return {
      item,
      buy: best ? value(best.cost) : unavailable,
      purchases: offers,
      offers,
      alternatives,
      quotes,
      complete: true,
      route: best?.route,
      cost: best ? value(best.cost) : unavailable,
      sale: best ? value(best.sale) : unavailable,
      profit: best ? value(best.profit) : unavailable,
      roi: best
        ? best.roi === undefined
          ? {
              state: "undefined" as const,
              reason: "No spirit-stone investment.",
            }
          : value(best.roi)
        : unavailable,
    };
  });
}
