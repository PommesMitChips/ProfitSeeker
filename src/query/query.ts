import { Item, Preferences, Row, SortKey, World } from "../domain/model";
import { canCraftNow } from "../planner/engine";
import { saleable } from "../mechanics/pricing";
export const clampPage = (page: number, count: number, size = 40): number =>
  Math.max(0, Math.min(page, Math.max(0, Math.ceil(count / size) - 1)));
export function matchScore(
  item: Item,
  world: World,
  query: string,
): [number, number] {
  const words = [
    ...new Set(query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)),
  ];
  const names = `${item.name} ${item.label}`.toLocaleLowerCase();
  const description = item.description.toLocaleLowerCase();
  const metadata = [
    item.kind,
    item.realm,
    ...(world.sources.get(item.name) ?? []).flatMap((s) => [
      s.label,
      s.location,
    ]),
    ...(world.recipesByOutput.get(item.name) ?? []).flatMap((r) => [
      r.name,
      ...r.ingredients.map((i) => i.name),
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  let count = 0,
    weight = 0;
  for (const word of words) {
    const score = names.includes(word)
      ? 3
      : description.includes(word)
        ? 2
        : metadata.includes(word)
          ? 1
          : 0;
    if (score) {
      count++;
      weight += score;
    }
  }
  return [count, weight];
}
export function visibleItems(world: World, prefs: Preferences): Item[] {
  const { filters } = prefs;
  return [...world.items.values()].filter((item) => {
    if (!saleable(item.raw)) return false;
    if (filters.realm !== "all" && item.realm !== filters.realm) return false;
    const recipes = world.recipesByOutput.get(item.name);
    if (filters.craftable && !recipes?.length) return false;
    if (filters.known && recipes?.length && !recipes.some((r) => r.known))
      return false;
    if (filters.craftNow && !canCraftNow(item, world, prefs.reservations))
      return false;
    if (
      filters.search.trim() &&
      matchScore(item, world, filters.search)[0] === 0
    )
      return false;
    return true;
  });
}
export function sortRows(
  rows: Row[],
  key: SortKey,
  descending: boolean,
  locale?: string,
): Row[] {
  return [...rows].sort((a, b) => {
    if (key === "item")
      return (
        (descending ? -1 : 1) *
          a.item.label.localeCompare(b.item.label, locale) ||
        a.item.key.localeCompare(b.item.key)
      );
    const av = a[key],
      bv = b[key];
    if (av.state !== "value" || bv.state !== "value")
      return av.state === "value"
        ? -1
        : bv.state === "value"
          ? 1
          : a.item.label.localeCompare(b.item.label, locale);
    return (
      (descending ? -1 : 1) * (av.value - bv.value) ||
      a.item.label.localeCompare(b.item.label, locale)
    );
  });
}
