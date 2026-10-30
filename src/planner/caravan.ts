import { Item, World } from "../domain/model";
import { ArbitrageRow } from "./arbitrage";
import { salePrice } from "../mechanics/pricing";
import { TravelContext } from "./travel";
import {
  bindCaravanOrders,
  observeCaravanProgress,
  CaravanProgress,
} from "./caravanProgress";
export interface CaravanTrade {
  orderId?: string;
  basis?: number;
  item: string;
  itemName?: string;
  key: string;
  quantity: number;
  buyAt?: string;
  buyId?: string;
  sellAt: string;
  sellId: string;
  sourceId?: string;
  group?: string;
  cost: number;
  sale: number;
  toBuyDays: number;
  toSellDays: number;
  cashAfter: number;
  carried: boolean;
}
interface Lot {
  id: string;
  quantity: number;
  cost: number;
}
interface ObservedOffer {
  key: string;
  quantity: number;
  cost: number;
  marketId?: string;
}
export interface CaravanPlan {
  progress?: CaravanProgress;
  trades: CaravanTrade[];
  startCash: number;
  endCash: number;
  days: number;
  gain: number;
  gainPerDay: number | null;
  current: string;
  baseline: Record<string, number>;
  tracked: Item[];
  lots: Record<string, Lot[]>;
  observedInventory: Record<string, number>;
  observedOffers: Record<string, ObservedOffer>;
  reason?: string;
  limited: boolean;
  createdAt: number;
}
interface Candidate {
  item: Item;
  buyId?: string;
  buyAt?: string;
  sellId: string;
  sellAt: string;
  sourceId: string;
  stock: number;
  cost: number;
  sale: number;
  basis: number;
  carried: boolean;
}
export function inventoryCounts(world: World): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of world.inventory)
    counts[i.key] = (counts[i.key] ?? 0) + i.quantity;
  return counts;
}
function remembered(item: Item): Item {
  const r = item.raw;
  return {
    ...item,
    raw: {
      name: item.name,
      kind: r.kind,
      realm: r.realm,
      rarity: r.rarity,
      valueTier: r.valueTier,
      harmonyAugment: r.harmonyAugment,
      enchantment: r.enchantment,
      hiddenPotential: r.hiddenPotential,
    },
  };
}
export function planCaravan(
  world: World,
  rows: ArbitrageRow[],
  travel: TravelContext,
  maxTrades = 8,
  previous?: CaravanPlan,
): CaravanPlan {
  if (previous)
    previous = observeCaravanProgress(previous, world, rows, travel);
  const held = inventoryCounts(world),
    baseline = previous?.baseline ?? held;
  const tracked = [
    ...new Map(
      [
        ...(previous?.tracked ?? []),
        ...rows.map((r) => remembered(r.item)),
      ].map((i) => [i.key, i]),
    ).values(),
  ];
  const offers: Record<string, ObservedOffer> = {};
  for (const r of rows)
    for (const s of r.offers)
      if (s.cost?.state === "value")
        offers[s.id] = {
          key: r.item.key,
          quantity: s.quantity ?? 0,
          cost: s.cost.value,
          marketId: s.marketId,
        };
  const lots: Record<string, Lot[]> = {};
  for (const i of tracked) {
    const existing = (previous?.lots?.[i.key] ?? []).map((l) => ({ ...l }));
    let increase =
      (held[i.key] ?? 0) -
      (previous?.observedInventory?.[i.key] ?? baseline[i.key] ?? 0);
    // Match actual inventory increases with stock decreases; future planned
    // purchases must not overwrite the basis of cargo already acquired.
    if (previous && increase > 0) {
      for (const [id, old] of Object.entries(previous.observedOffers ?? {})) {
        if (old.key !== i.key) continue;
        const acquired = Math.min(
          increase,
          Math.max(0, old.quantity - (offers[id]?.quantity ?? 0)),
        );
        if (acquired) {
          existing.push({
            id: `${id}:${previous.createdAt}:${existing.length}`,
            quantity: acquired,
            cost: old.cost,
          });
          increase -= acquired;
        }
      }
      for (const t of previous.trades) {
        if (increase <= 0) break;
        if (t.key !== i.key || t.carried || t.buyId !== travel.current)
          continue;
        const acquired = Math.min(increase, t.quantity);
        existing.push({
          id: `planned:${previous.createdAt}:${existing.length}`,
          quantity: acquired,
          cost: t.cost,
        });
        increase -= acquired;
      }
    }
    const heldCargo = Math.max(0, (held[i.key] ?? 0) - (baseline[i.key] ?? 0));
    let removed = existing.reduce((sum, l) => sum + l.quantity, 0) - heldCargo;
    for (const lot of existing) {
      const sold = Math.min(lot.quantity, Math.max(0, removed));
      lot.quantity -= sold;
      removed -= sold;
    }
    lots[i.key] = existing.filter((l) => l.quantity > 0);
  }
  const empty: CaravanPlan = {
    trades: [],
    startCash: travel.cash,
    endCash: travel.cash,
    days: 0,
    gain: 0,
    gainPerDay: null,
    current: travel.current,
    baseline,
    tracked,
    lots,
    observedInventory: held,
    observedOffers: offers,
    limited: false,
    createdAt: Date.now(),
  };
  if (travel.reason || !world.pricingVerified)
    return bindCaravanOrders(
      { ...empty, reason: travel.reason ?? "Price rules are unverified." },
      previous?.progress,
    );
  const candidates: Candidate[] = [];
  for (const row of rows)
    for (const a of row.alternatives) {
      const offer = row.offers.find((s) => s.id === a.route.id),
        sellId = a.quote.marketId;
      if (
        !offer?.marketId ||
        !sellId ||
        a.profit <= 0 ||
        a.cost < 0 ||
        !Number.isFinite(a.cost) ||
        !offer.quantity
      )
        continue;
      candidates.push({
        item: row.item,
        buyId: offer.marketId,
        buyAt: offer.location,
        sellId,
        sellAt: a.quote.market,
        sourceId: offer.id,
        stock: Math.floor(offer.quantity),
        cost: a.cost,
        basis: a.cost,
        sale: a.sale,
        carried: false,
      });
    }
  for (const item of tracked)
    for (const lot of lots[item.key] ?? [])
      for (const m of world.markets) {
        if (m.availability !== "available") continue;
        const sale = salePrice(item, m);
        if (sale.state !== "value" || sale.value <= lot.cost) continue;
        candidates.push({
          item,
          sellId: m.id,
          sellAt: m.name,
          sourceId: `held:${lot.id}`,
          stock: lot.quantity,
          cost: 0,
          basis: lot.cost,
          sale: sale.value,
          carried: true,
        });
      }
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = JSON.stringify([c.buyId, c.sellId]);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, group] of groups)
    if (group[0].buyId)
      groups.set(key, [
        ...group,
        ...candidates.filter((c) => c.carried && c.sellId === group[0].sellId),
      ]);
  type Search = {
    cash: number;
    profit: number;
    days: number;
    location: string;
    used: Record<string, number>;
    trades: CaravanTrade[];
  };
  const initial: Search = {
    cash: travel.cash,
    profit: 0,
    days: 0,
    location: travel.current,
    used: {},
    trades: [],
  };
  const score = (s: Search) =>
    s.profit <= 0 ? 0 : s.days === 0 ? Infinity : s.profit / s.days;
  const compare = (a: Search, b: Search) => {
    const x = score(a),
      y = score(b);
    return x === y
      ? b.profit - a.profit || a.days - b.days || b.cash - a.cash
      : y > x
        ? 1
        : -1;
  };
  const limit = Math.min(20, Math.max(1, maxTrades));
  let frontier = [initial],
    best = initial,
    limited = false;
  for (let depth = 0; depth < limit; depth++) {
    const next: Search[] = [];
    for (const s of frontier) {
      if (s.trades.length >= limit) {
        limited = true;
        continue;
      }
      const choices: Search[] = [];
      for (const group of groups.values()) {
        const lead = group[0],
          first = lead.buyId ? travel.days[s.location]?.[lead.buyId] : 0,
          second = travel.days[lead.buyId ?? s.location]?.[lead.sellId];
        if (first === undefined || second === undefined) continue;
        const available = group.filter(
          (c) => c.stock > (s.used[c.sourceId] ?? 0),
        );
        const margin = (c: Candidate) => c.sale - c.basis;
        const efficiency = (c: Candidate) =>
          c.cost === 0 ? Infinity : margin(c) / c.cost;
        const orders = [
          ...available.map((c) => [c]),
          [...available].sort(
            (a, b) => efficiency(b) - efficiency(a) || margin(b) - margin(a),
          ),
          [...available].sort((a, b) => margin(b) - margin(a)),
          [...available].sort((a, b) => a.cost - b.cost),
        ];
        for (const order of orders) {
          let spending = 0,
            proceeds = 0,
            profit = 0;
          const used = { ...s.used },
            trades: CaravanTrade[] = [];
          for (const c of order) {
            if (s.trades.length + trades.length >= limit) break;
            const remaining = c.stock - (used[c.sourceId] ?? 0),
              quantity = Math.min(
                remaining,
                c.cost === 0
                  ? remaining
                  : Math.floor((s.cash - spending) / c.cost),
              );
            if (quantity < 1) continue;
            spending += quantity * c.cost;
            proceeds += quantity * c.sale;
            profit += quantity * margin(c);
            used[c.sourceId] = (used[c.sourceId] ?? 0) + quantity;
            trades.push({
              item: c.item.label,
              itemName: c.item.name,
              key: c.item.key,
              quantity,
              buyId: c.buyId,
              buyAt: c.buyAt,
              sellId: c.sellId,
              sellAt: c.sellAt,
              sourceId: c.sourceId,
              group: `${s.trades.length}:${lead.buyId ?? s.location}:${lead.sellId}`,
              cost: c.cost,
              basis: c.basis,
              sale: c.sale,
              toBuyDays: trades.length ? 0 : first,
              toSellDays: trades.length ? 0 : second,
              cashAfter: 0,
              carried: c.carried,
            });
          }
          if (!trades.length) continue;
          const cash = s.cash - spending + proceeds;
          trades.forEach((t) => (t.cashAfter = cash));
          choices.push({
            cash,
            profit: s.profit + profit,
            days: s.days + first + second,
            location: lead.sellId,
            used,
            trades: [...s.trades, ...trades],
          });
        }
      }
      choices.sort(compare);
      if (choices.length > 32) limited = true;
      next.push(...choices.slice(0, 32));
    }
    if (!next.length) break;
    const unique = new Map<string, Search>();
    for (const s of next) {
      const key = JSON.stringify([s.location, Object.entries(s.used).sort()]);
      const prior = unique.get(key);
      if (!prior || compare(s, prior) < 0) unique.set(key, s);
    }
    const ranked = [...unique.values()].sort(compare);
    if (ranked.length > 48) limited = true;
    frontier = ranked.slice(0, 48);
    if (compare(frontier[0], best) < 0) best = frontier[0];
  }
  return bindCaravanOrders(
    {
      ...empty,
      trades: best.trades,
      endCash: best.cash,
      days: best.days,
      gain: best.profit,
      gainPerDay: best.days ? best.profit / best.days : null,
      limited,
      reason: best.trades.length
        ? undefined
        : "No affordable profitable trades with confirmed stock and travel times.",
    },
    previous?.progress,
  );
}
