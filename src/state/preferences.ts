import { Preferences, Raw, defaults, obj, str } from "../domain/model";
export const MOD_ID = "afnm-profitseeker";
export function readPreferences(state: Raw): Preferences {
  const saved = obj(obj(obj(obj(state.mod).data)[MOD_ID]).preferences),
    base = defaults();
  const filters = obj(saved.filters),
    options = obj(saved.options),
    sort = obj(saved.sort);
  const bool = (input: unknown, fallback: boolean) =>
    typeof input === "boolean" ? input : fallback;
  base.filters = {
    search: str(filters.search),
    realm: str(filters.realm, "all"),
    known: bool(filters.known, true),
    craftNow: bool(filters.craftNow, false),
    craftable: bool(filters.craftable, false),
  };
  base.options = {
    tier: ["basic", "perfect", "sublime"].includes(str(options.tier))
      ? (options.tier as Preferences["options"]["tier"])
      : "perfect",
    quality:
      options.quality === "achieved"
        ? "achieved"
        : typeof options.quality === "number" &&
            Number.isSafeInteger(options.quality) &&
            options.quality >= 0
          ? options.quality
          : "achieved",
    buy: bool(options.buy, true),
    farm: bool(options.farm, false),
    inventory: bool(options.inventory, true),
  };
  base.sort = {
    key: ["item", "cost", "sale", "profit", "roi"].includes(str(sort.key))
      ? (sort.key as Preferences["sort"]["key"])
      : "profit",
    descending: bool(sort.descending, true),
  };
  // The reserve editor was removed; old saves must not retain invisible exclusions.
  base.reservations = {};
  if (Array.isArray(saved.marketIds)) base.marketIds = [...new Set(saved.marketIds.filter((id): id is string => typeof id === 'string'))];
  return base;
}
