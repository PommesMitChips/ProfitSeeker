import { useEffect, useMemo, useState } from "react";
import { Raw, Row, World, Item, Preferences, obj, str } from "../domain/model";
import { GameAPI, RecipeReader, ScreenAPI } from "../game/api";
import { readWorld } from "../catalogue/readWorld";
import { useI18n } from "../i18n";
import { evaluateRow } from "../planner/engine";
import {
  createProfitSelector,
  createFlagSelector,
  WorldInputs,
  worldInputs,
  planWorldChange,
  hasWorldWork,
  affectedItems,
  FlagSelection,
} from "./changes";
export interface SaveCache {
  world: World | null;
  craft: Map<string, { rows: Row[]; world: World | null }>;
  mode: "crafting" | "arbitrage";
  revision: number;
  inputs?: WorldInputs;
  allRevision: number;
  tradeRevision: number;
  itemRevisions: Map<string, number>;
  rowResults: Map<string, Map<string, { stamp: string; row: Row }>>;
  memo: NonNullable<World["memo"]>;
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
    allRevision: 0,
    tradeRevision: 0,
    itemRevisions: new Map(),
    rowResults: new Map(),
    memo: { craftability: new Map(), arbitrage: new Map() },
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
export function updateCachedWorld(
  cache: SaveCache,
  api: GameAPI,
  state: Raw,
  flags: Record<string, number>,
  selection: FlagSelection,
  language: string,
): World {
  const inputs = worldInputs(api, state, selection, language, cache.inputs),
    change = planWorldChange(cache.inputs, inputs, cache.world);
  if (!hasWorldWork(change)) {
    cache.inputs = inputs;
    return cache.world!;
  }
  const reader =
    change.full || change.read.recipes ? new RecipeReader(api) : undefined;
  let world: World;
  try {
    world = readWorld(
      api,
      state,
      flags,
      reader,
      cache.revision + 1,
      change.full ? undefined : (cache.world ?? undefined),
      change.read,
    );
  } finally {
    reader?.dispose();
  }
  if (change.allRows) cache.allRevision++;
  if (change.marketChanged) cache.tradeRevision++;
  const affected = affectedItems(world, change.items);
  for (const name of affected)
    cache.itemRevisions.set(name, (cache.itemRevisions.get(name) ?? 0) + 1);
  world.revisions = {
    all: cache.allRevision,
    items: new Map(cache.itemRevisions),
    trade: cache.tradeRevision,
  };
  world.memo = cache.memo;
  cache.inputs = inputs;
  cache.world = world;
  cache.revision = world.revision;
  return world;
}
export function cachedRow(
  cache: SaveCache,
  key: string,
  item: Item,
  world: World,
  prefs: Preferences,
): Row {
  let entries = cache.rowResults.get(key);
  if (!entries) {
    entries = new Map();
    cache.rowResults.set(key, entries);
    if (cache.rowResults.size > 4)
      cache.rowResults.delete(cache.rowResults.keys().next().value!);
  }
  const stamp = `${cache.allRevision}:${cache.itemRevisions.get(item.name) ?? 0}`,
    previous = entries.get(item.name);
  if (previous?.stamp === stamp) return previous.row;
  const row = evaluateRow(item, world, prefs);
  entries.set(item.name, { stamp, row });
  return row;
}
export function useProfitWorld(
  api: GameAPI,
  screenAPI: ScreenAPI,
  active = true,
) {
  const { version: languageVersion } = useI18n();
  const selector = useMemo(() => createProfitSelector(), []);
  const state = screenAPI.useSelector(selector),
    flags = screenAPI.useGameFlags();
  const flagSelector = useMemo(
    () => createFlagSelector(api.gameData, flags.flags),
    [
      api,
      api.gameData.items,
      api.gameData.locations,
      api.gameData.crops,
      api.gameData.mineConfigs,
      api.gameData.researchableMap,
      obj(state.mod).activeMods,
    ],
  );
  const selectedFlags = flagSelector(flags.flags);
  const identity = saveIdentity(state),
    cache = useMemo(() => saveCache(identity), [identity]);
  const [current, setCurrent] = useState<{
    cache: SaveCache;
    world: World | null;
  }>({ cache, world: cache.world });
  const [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!active || !screenAPI.hasSave) {
      setRefreshing(false);
      return;
    }
    const inputs = worldInputs(
      api,
      state,
      selectedFlags,
      languageVersion,
      cache.inputs,
    );
    if (!hasWorldWork(planWorldChange(cache.inputs, inputs, cache.world))) {
      cache.inputs = inputs;
      if (current.cache !== cache || current.world !== cache.world)
        setCurrent({ cache, world: cache.world });
      setRefreshing(false);
      return;
    }
    let cancelled = false;
    setRefreshing(true);
    setError("");
    const timer = setTimeout(() => {
      try {
        const world = updateCachedWorld(
          cache,
          api,
          state,
          flags.flags,
          selectedFlags,
          languageVersion,
        );
        if (!cancelled) {
          cache.world = world;
          setCurrent({ cache, world });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
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
    state,
    selectedFlags.values,
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
