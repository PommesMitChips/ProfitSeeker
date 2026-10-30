import { useEffect, useMemo, useState } from "react";
import { Raw, Row, World, obj, str } from "../domain/model";
import { GameAPI, RecipeReader, ScreenAPI } from "../game/api";
import { readWorld } from "../catalogue/readWorld";
import { useI18n } from "../i18n";
export interface SaveCache {
  world: World | null;
  craft: Map<string, { rows: Row[]; world: World | null }>;
  mode: "crafting" | "arbitrage";
  revision: number;
}
const caches = new Map<string, SaveCache>();
export function saveIdentity(state: Raw): string | undefined {
  const created = obj(state.newGame).createdAt,
    p = obj(obj(state.player).player);
  if (
    (typeof created !== "string" && typeof created !== "number") ||
    String(created) === ""
  )
    return undefined;
  return JSON.stringify([created, str(p.forename), str(p.surname)]);
}
export function saveCache(id?: string): SaveCache {
  if (id && caches.has(id)) return caches.get(id)!;
  const cache: SaveCache = {
    world: null,
    craft: new Map(),
    mode: "crafting",
    revision: 0,
  };
  if (id) {
    caches.set(id, cache);
    if (caches.size > 5) caches.delete(caches.keys().next().value!);
  }
  return cache;
}
export function cacheCraft(
  cache: SaveCache,
  key: string,
  rows: Row[],
  world: World | null = cache.world,
) {
  cache.craft.set(key, { rows, world });
  if (cache.craft.size > 4)
    cache.craft.delete(cache.craft.keys().next().value!);
}
export function useProfitWorld(
  api: GameAPI,
  screenAPI: ScreenAPI,
  active = true,
) {
  const { version: languageVersion } = useI18n();
  const state = screenAPI.useSelector((s) => s),
    flags = screenAPI.useGameFlags();
  const identity = saveIdentity(state),
    cache = useMemo(() => saveCache(identity), [identity]);
  const [current, setCurrent] = useState<{
    cache: SaveCache;
    world: World | null;
  }>({ cache, world: cache.world });
  const [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!active || !screenAPI.hasSave) return;
    let cancelled = false;
    setRefreshing(true);
    setError("");
    const timer = setTimeout(() => {
      const reader = new RecipeReader(api);
      try {
        const world = readWorld(
          api,
          state,
          flags.flags,
          reader,
          ++cache.revision,
        );
        if (!cancelled) {
          cache.world = world;
          setCurrent({ cache, world });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        reader.dispose();
        if (!cancelled) setRefreshing(false);
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    active,
    screenAPI.hasSave,
    api,
    cache,
    state.inventory,
    state.player,
    state.breakthrough,
    state.location,
    state.version,
    state.mine,
    state.herbField,
    obj(state.mod).activeMods,
    flags.flagsJSON,
    languageVersion,
  ]);
  return {
    state,
    flags: flags.flags,
    identity,
    cache,
    world: current.cache === cache ? current.world : cache.world,
    error,
    refreshing,
  };
}
export type ProfitData = ReturnType<typeof useProfitWorld>;
