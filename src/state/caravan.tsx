import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GameAPI, ScreenAPI } from "../game/api";
import { ProfitData } from "./runtime";
import { MOD_ID, readPreferences } from "./preferences";
import { obj } from "../domain/model";
import { selectMarkets } from "../query/markets";
import { cachedArbitrageRows } from "../planner/arbitrage";
import { createTravelReader } from "../planner/travel";
import { CaravanPlan, planCaravan } from "../planner/caravan";
import {
  caravanStops,
  observeCaravanProgress,
} from "../planner/caravanProgress";
export interface CaravanSettings {
  autoUpdate: boolean;
  overlay: boolean;
  maxTrades: number;
  cursor: number;
  plan?: CaravanPlan;
}
export function readCaravan(data: ProfitData): CaravanSettings {
  const saved = obj(obj(obj(obj(data.state.mod).data)[MOD_ID]).caravan);
  const p = obj(saved.plan);
  const plan =
    Array.isArray(p.trades) &&
    Array.isArray(p.tracked) &&
    p.baseline &&
    typeof p.startCash === "number"
      ? (p as unknown as CaravanPlan)
      : undefined;
  return {
    autoUpdate: saved.autoUpdate === true,
    overlay: saved.overlay === true,
    maxTrades:
      typeof saved.maxTrades === "number"
        ? Math.max(1, Math.min(20, Math.floor(saved.maxTrades)))
        : 8,
    cursor:
      saved.cursorMode === "location" && typeof saved.cursor === "number"
        ? Math.max(0, Math.floor(saved.cursor))
        : 0,
    plan,
  };
}
export function useCaravan(
  api: GameAPI,
  screenAPI: ScreenAPI,
  data: ProfitData,
) {
  const settings = readCaravan(data),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const latest = useRef(settings);
  latest.current = settings;
  const lastRun = useRef<object | undefined>(undefined);
  const readTravel = useMemo(() => createTravelReader(), [api]);
  const ids = readPreferences(data.state).marketIds,
    marketKey = JSON.stringify(ids);
  const world = useMemo(
    () => (data.world ? selectMarkets(data.world, ids) : null),
    [data.world, marketKey],
  );
  const rows = useMemo(
    () => (world && settings.plan ? cachedArbitrageRows(world) : []),
    [world, !!settings.plan],
  );
  const cargoKey = useMemo(
    () => caravanCargoKey(settings.plan, world),
    [settings.plan?.tracked, world?.inventory],
  );
  const travel = useMemo(
    () =>
      world && settings.plan
        ? readTravel(api, data.state, data.flags, world)
        : undefined,
    [
      api,
      world?.markets,
      world?.knownLocations,
      data.state.player,
      data.state.breakthrough,
      obj(data.state.inventory).money,
      obj(data.state.location).current,
      !!settings.plan,
    ],
  );
  // Stable dependency identities replace serializing every offer/route each render.
  const key = useMemo(
    () => ({}),
    [
      data.identity,
      marketKey,
      settings.maxTrades,
      settings.autoUpdate,
      travel,
      rows,
      cargoKey,
    ],
  );
  const save = (patch: Partial<CaravanSettings>) => {
    latest.current = { ...latest.current, ...patch };
    screenAPI.actions?.setModData?.(MOD_ID, "caravan", {
      ...latest.current,
      cursorMode: "location",
    });
  };
  const generate = () => {
    if (!world || data.refreshing) return;
    const currentTravel = readTravel(api, data.state, data.flags, world);
    setBusy(true);
    setError("");
    try {
      const plan = planCaravan(
        world,
        cachedArbitrageRows(world),
        currentTravel,
        latest.current.maxTrades,
        latest.current.plan,
      );
      lastRun.current = key;
      const stops = caravanStops(plan),
        current = stops.findIndex((s) => s.location === currentTravel.current);
      save({ plan, cursor: Math.max(0, current) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!settings.plan || !world || data.refreshing || lastRun.current === key)
      return;
    const timer = setTimeout(() => {
      if (settings.autoUpdate) generate();
      else if (world && travel && latest.current.plan) {
        const previous = latest.current.plan;
        const plan = observeCaravanProgress(previous, world, rows, travel);
        lastRun.current = key;
        if (plan !== previous) save({ plan });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [settings.autoUpdate, !!settings.plan, world, key, data.refreshing]);
  return {
    settings,
    save,
    generate,
    busy,
    error,
    ready: !!world && !data.refreshing,
    cash: obj(data.state.inventory).money,
  };
}
export type CaravanController = ReturnType<typeof useCaravan>;
export function caravanCargoKey(
  plan: CaravanPlan | undefined,
  world: ProfitData["world"],
): string {
  if (!plan || !world) return "";
  const tracked = new Set(plan.tracked.map((i) => i.key)),
    counts = new Map<string, number>();
  for (const i of world.inventory)
    if (tracked.has(i.key))
      counts.set(i.key, (counts.get(i.key) ?? 0) + i.quantity);
  return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
}
export const CaravanContext = createContext<CaravanController | null>(null);
export const useCaravanController = () => useContext(CaravanContext);
