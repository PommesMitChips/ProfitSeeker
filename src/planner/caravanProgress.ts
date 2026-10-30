import type { World } from "../domain/model";
import { salePrice } from "../mechanics/pricing";
import type { ArbitrageRow } from "./arbitrage";
import type { CaravanPlan, CaravanTrade } from "./caravan";
import type { TravelContext } from "./travel";

export interface CaravanOrder {
  id: string;
  trade: CaravanTrade;
  bought: number;
  sold: number;
  removed: number;
  gained: number;
  uncertain: boolean;
  lots: { quantity: number; cost: number; confirmed: boolean }[];
}
export interface CaravanProgress {
  nextId: number;
  orders: CaravanOrder[];
  inventory: Record<string, number>;
  offers: Record<string, { quantity: number; cost: number }>;
  cash: number;
}
export interface CaravanStop {
  id: string;
  location: string;
  label: string;
  days: number;
  orders: { action: "buy" | "sell"; quantity: number; order: CaravanOrder }[];
}
const counts = (world: World) => {
  const result: Record<string, number> = {};
  for (const i of world.inventory)
    result[i.key] = (result[i.key] ?? 0) + i.quantity;
  return result;
};
const offers = (rows: ArbitrageRow[]) =>
  Object.fromEntries(
    rows.flatMap((r) =>
      r.offers.flatMap((s) =>
        s.cost?.state === "value"
          ? [[s.id, { quantity: s.quantity ?? 0, cost: s.cost.value }]]
          : [],
      ),
    ),
  );
const remaining = (order: CaravanOrder) =>
  order.lots.reduce((n, l) => n + l.quantity, 0);
export const orderExpectedProfit = (order: CaravanOrder) =>
  order.trade.quantity *
  (order.trade.sale - (order.trade.basis ?? order.trade.cost));

/** Keep filled orders when replanning, but discard superseded unfilled proposals. */
export function bindCaravanOrders(
  plan: CaravanPlan,
  prior?: CaravanProgress,
): CaravanPlan {
  const progress: CaravanProgress = prior
    ? {
        ...prior,
        orders: prior.orders
          .filter((o) => o.bought > 0)
          .map((o) => ({ ...o, trade: { ...o.trade, quantity: o.bought } })),
      }
    : {
        nextId: 1,
        orders: [],
        inventory: { ...plan.observedInventory },
        offers: { ...plan.observedOffers },
        cash: plan.startCash,
      };
  const assigned = new Map<string, number>();
  const trades: CaravanTrade[] = [];
  for (const trade of plan.trades) {
    let quantity = trade.quantity;
    const append = (order: CaravanOrder, amount: number) => {
      const part = {
        ...trade,
        quantity: amount,
        orderId: order.id,
        toBuyDays: quantity === trade.quantity ? trade.toBuyDays : 0,
        toSellDays: quantity === trade.quantity ? trade.toSellDays : 0,
      };
      trades.push(part);
      order.trade = {
        ...order.trade,
        sellAt: trade.sellAt,
        sellId: trade.sellId,
        sale: trade.sale,
      };
      assigned.set(order.id, (assigned.get(order.id) ?? 0) + amount);
      quantity -= amount;
    };
    if (trade.carried) {
      for (const order of progress.orders) {
        if (!quantity) break;
        if (order.trade.key !== trade.key) continue;
        const available = remaining(order) - (assigned.get(order.id) ?? 0);
        if (available > 0) append(order, Math.min(quantity, available));
      }
    }
    if (quantity) {
      const id = `order-${progress.nextId++}`;
      const order: CaravanOrder = {
        id,
        trade: { ...trade, quantity, orderId: id },
        bought: trade.carried ? quantity : 0,
        sold: 0,
        removed: 0,
        gained: 0,
        uncertain: trade.carried,
        lots: trade.carried
          ? [{ quantity, cost: trade.basis ?? trade.cost, confirmed: false }]
          : [],
      };
      progress.orders.push(order);
      append(order, quantity);
    }
  }
  return { ...plan, trades, progress };
}

/** Observe progress without changing the chosen route. Cash must reconcile with
 * inventory and market prices before a disposal is credited as realized profit. */
export function observeCaravanProgress(
  plan: CaravanPlan,
  world: World,
  rows: ArbitrageRow[],
  travel: TravelContext,
): CaravanPlan {
  if (!plan.progress) plan = bindCaravanOrders(plan);
  const old = plan.progress!,
    inventory = counts(world),
    stock = offers(rows);
  if (
    JSON.stringify(inventory) === JSON.stringify(old.inventory) &&
    JSON.stringify(stock) === JSON.stringify(old.offers) &&
    travel.cash === old.cash
  )
    return plan;
  const progress: CaravanProgress = {
    ...old,
    inventory,
    offers: stock,
    cash: travel.cash,
    orders: old.orders.map((o) => ({
      ...o,
      trade: { ...o.trade },
      lots: o.lots.map((l) => ({ ...l })),
    })),
  };
  const increases = new Map<string, number>(),
    decreases = new Map<string, number>();
  for (const key of new Set([
    ...Object.keys(inventory),
    ...Object.keys(old.inventory),
  ])) {
    const delta = (inventory[key] ?? 0) - (old.inventory[key] ?? 0);
    if (delta > 0) increases.set(key, delta);
    if (delta < 0) decreases.set(key, -delta);
  }
  let expectedCash = 0;
  const acquired: { order: CaravanOrder; quantity: number; cost: number }[] =
    [];
  const disposed: {
    order: CaravanOrder;
    quantity: number;
    cost: number;
    proceeds?: number;
    basisConfirmed: boolean;
  }[] = [];
  const usedStock = new Map<string, number>();
  for (const order of progress.orders) {
    const t = order.trade,
      increased = increases.get(t.key) ?? 0;
    if (!increased || t.buyId !== travel.current || !t.sourceId) continue;
    const offer = old.offers[t.sourceId];
    const available = offer
      ? Math.max(
          0,
          offer.quantity -
            (stock[t.sourceId]?.quantity ?? 0) -
            (usedStock.get(t.sourceId) ?? 0),
        )
      : 0;
    const quantity = Math.min(
      increased,
      available,
      Math.max(0, t.quantity - order.bought),
    );
    if (!quantity || !offer) continue;
    acquired.push({ order, quantity, cost: offer.cost });
    expectedCash -= quantity * offer.cost;
    increases.set(t.key, increased - quantity);
    usedStock.set(t.sourceId, (usedStock.get(t.sourceId) ?? 0) + quantity);
  }
  for (const order of progress.orders) {
    const t = order.trade,
      quantity = Math.min(decreases.get(t.key) ?? 0, remaining(order));
    if (!quantity) continue;
    let left = quantity,
      cost = 0,
      basisConfirmed = true;
    for (const lot of order.lots) {
      const count = Math.min(left, lot.quantity);
      cost += count * lot.cost;
      if (count && !lot.confirmed) basisConfirmed = false;
      lot.quantity -= count;
      left -= count;
    }
    const market = world.markets.find(
        (m) => m.id === travel.current && m.availability === "available",
      ),
      item = plan.tracked.find((i) => i.key === t.key),
      quote =
        market && item && world.pricingVerified
          ? salePrice(item, market)
          : undefined,
      proceeds = quote?.state === "value" ? quote.value * quantity : undefined;
    disposed.push({ order, quantity, cost, proceeds, basisConfirmed });
    if (proceeds !== undefined) expectedCash += proceeds;
    decreases.set(t.key, (decreases.get(t.key) ?? 0) - quantity);
  }
  const reconciled =
    !travel.reason &&
    [...increases.values(), ...decreases.values()].every((n) => n === 0) &&
    disposed.every((d) => d.proceeds !== undefined) &&
    Math.abs(travel.cash - old.cash - expectedCash) < 0.001;
  for (const { order, quantity, cost } of acquired) {
    order.bought += quantity;
    order.lots.push({ quantity, cost, confirmed: reconciled });
    if (!reconciled) order.uncertain = true;
  }
  for (const d of disposed) {
    if (reconciled && d.basisConfirmed) {
      d.order.sold += d.quantity;
      d.order.gained += d.proceeds! - d.cost;
    } else {
      d.order.removed += d.quantity;
      d.order.uncertain = true;
    }
  }
  return { ...plan, progress };
}

/** Preserve visit order. Only adjacent actions at the same location are merged. */
export function caravanStops(plan: CaravanPlan): CaravanStop[] {
  if (!plan.progress) plan = bindCaravanOrders(plan);
  const orders = plan.progress!.orders,
    stops: CaravanStop[] = [];
  const add = (
    location: string,
    label: string,
    days: number,
    action: "buy" | "sell",
    quantity: number,
    order: CaravanOrder,
  ) => {
    let stop = stops.at(-1);
    if (!stop || stop.location !== location) {
      stop = {
        id: `${stops.length}:${location}`,
        location,
        label,
        days,
        orders: [],
      };
      stops.push(stop);
    }
    const entry = stop.orders.find(
      (e) => e.action === action && e.order.id === order.id,
    );
    if (entry) entry.quantity += quantity;
    else stop.orders.push({ action, quantity, order });
  };
  const active = new Set(plan.trades.map((t) => t.orderId));
  for (const order of orders) {
    if (!active.has(order.id) && (order.sold || order.removed))
      add(
        order.trade.sellId,
        order.trade.sellAt,
        0,
        "sell",
        order.bought,
        order,
      );
  }
  const groups: CaravanTrade[][] = [];
  for (const trade of plan.trades) {
    const last = groups.at(-1);
    if (last && trade.group && last[0].group === trade.group) last.push(trade);
    else groups.push([trade]);
  }
  for (const group of groups) {
    let firstBuy = true;
    for (const trade of group) {
      const order = orders.find((o) => o.id === trade.orderId)!;
      if (trade.buyId) {
        add(
          trade.buyId,
          trade.buyAt ?? trade.buyId,
          firstBuy ? group[0].toBuyDays : 0,
          "buy",
          trade.quantity,
          order,
        );
        firstBuy = false;
      }
    }
    for (const trade of group) {
      const order = orders.find((o) => o.id === trade.orderId)!;
      add(
        trade.sellId,
        trade.sellAt,
        trade === group[0] ? group[0].toSellDays : 0,
        "sell",
        trade.quantity +
          (trade.carried &&
          !stops
            .at(-1)
            ?.orders.some((e) => e.action === "sell" && e.order.id === order.id)
            ? order.sold + order.removed
            : 0),
        order,
      );
    }
  }
  return stops;
}
