import { World } from "../domain/model";
export const knownMarkets = (world: World) =>
  world.markets.filter((m) => m.known ?? m.availability === "available");
const scoped = new WeakMap<World, Map<string, World>>();
export function selectMarkets(world: World, ids?: string[]): World {
  const key = ids === undefined ? "all" : JSON.stringify([...ids].sort());
  const entries = scoped.get(world) ?? new Map<string, World>();
  if (entries.has(key)) return entries.get(key)!;
  const markets = knownMarkets(world).filter(
    (m) => ids === undefined || ids.includes(m.id),
  );
  const selected = new Set(markets.map((m) => m.id));
  const result = {
    ...world,
    markets,
    sources: new Map(
      [...world.sources].map(([name, sources]) => [
        name,
        sources.filter(
          (s) => s.kind !== "buy" || (!!s.marketId && selected.has(s.marketId)),
        ),
      ]),
    ),
  };
  entries.set(key, result);
  if (entries.size > 8) entries.delete(entries.keys().next().value!);
  scoped.set(world, entries);
  return result;
}
