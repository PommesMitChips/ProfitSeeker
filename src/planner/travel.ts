import { GameAPI } from "../game/api";
import { Raw, World, obj, str, list } from "../domain/model";
export interface TravelContext {
  cash: number;
  current: string;
  days: Record<string, Record<string, number>>;
  reason?: string;
}
export function travelContext(
  api: GameAPI,
  state: Raw,
  flags: Record<string, number>,
  world: World,
): TravelContext {
  const money = obj(state.inventory).money,
    current = str(obj(state.location).current);
  const context: TravelContext = {
    cash:
      typeof money === "number" && Number.isFinite(money) && money >= 0
        ? money
        : NaN,
    current,
    days: {},
  };
  if (!Number.isFinite(context.cash)) {
    context.reason = "Current spirit-stone balance is unavailable.";
    return context;
  }
  if (!current) {
    context.reason = "Current location is unavailable.";
    return context;
  }
  if (
    !api.utils.discoverUnlockedLocations ||
    !api.utils.getMoveSpeedMultiplier
  ) {
    context.reason = "The game travel-time API is unavailable.";
    return context;
  }
  try {
    const discovered: Raw[] = [];
    api.utils.discoverUnlockedLocations(flags, discovered);
    const known = new Set(discovered.map((l) => str(l.name)));
    known.add(current);
    const multiplier = api.utils.getMoveSpeedMultiplier(
      obj(obj(state.player).player),
      obj(state.breakthrough),
    );
    if (!Number.isFinite(multiplier) || multiplier < 0)
      throw Error("Travel speed is unresolved.");
    const graph = new Map<string, { to: string; distance: number }[]>();
    const add = (from: string, to: string, distance: number) =>
      graph.set(from, [...(graph.get(from) ?? []), { to, distance }]);
    for (const location of discovered)
      for (const edge of list(location.unlocks)) {
        const from = str(location.name),
          to = str(obj(edge.location).name),
          distance = edge.distance;
        if (
          !from ||
          !to ||
          typeof distance !== "number" ||
          !Number.isFinite(distance) ||
          distance < 0
        )
          continue;
        add(from, to, distance);
        add(to, from, distance);
      }
    const endpoints = [
      ...new Set([current, ...world.markets.map((m) => m.id)]),
    ];
    for (const from of endpoints) {
      const distances = new Map<string, number>([[from, 0]]),
        done = new Set<string>();
      for (;;) {
        let next: string | undefined,
          best = Infinity;
        for (const [name, d] of distances)
          if (!done.has(name) && d < best) {
            next = name;
            best = d;
          }
        if (!next) break;
        done.add(next);
        for (const e of graph.get(next) ?? [])
          if (
            known.has(e.to) &&
            best + e.distance < (distances.get(e.to) ?? Infinity)
          )
            distances.set(e.to, best + e.distance);
      }
      const row: Record<string, number> = {};
      for (const to of endpoints) {
        if (!known.has(to)) continue;
        const direct = (graph.get(from) ?? []).find((e) => e.to === to);
        const raw = from === to ? 0 : (direct?.distance ?? distances.get(to));
        if (raw !== undefined) row[to] = Math.ceil(raw * multiplier);
      }
      context.days[from] = row;
    }
  } catch (e) {
    context.reason =
      e instanceof Error ? e.message : "Travel times are unresolved.";
  }
  return context;
}
