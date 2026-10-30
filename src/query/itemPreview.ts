import { Item, Recipe, Row, Source, Tier, World } from "../domain/model";
import { bonusMode, resolveItemOutput } from "../mechanics/results";
import { english, I18n } from "../i18n";

export const tierLabel = (tier: Tier): string =>
  tier === "basic" ? "Normal" : tier === "perfect" ? "Perfect" : "Sublime";

export function previewRecipe(
  row: Row,
  world: World,
  tier: Tier,
  chosen?: string,
): Recipe | undefined {
  const recipes = world.recipesByOutput.get(row.item.name) ?? [];
  return (
    recipes.find((r) => r.name === chosen) ??
    row.route?.recipe ??
    recipes.find(
      (r) =>
        (
          r.outputs[tier] ??
          (tier === "sublime" ? r.outputs.perfect : undefined)
        )?.name === row.item.name,
    ) ??
    recipes[0]
  );
}

/** The compact yield is the unlocked native repeat result, never a planned star override. */
export function instantYieldLabel(
  item: Item,
  recipe: Recipe | undefined,
  tier: Tier,
  world: World,
  i18n: I18n = english,
): string {
  const { t, n } = i18n;
  if (!recipe) return t("Yield: — (not crafted)");
  if (recipe.error) return t("Yield: Unknown");
  const output = resolveItemOutput(recipe, item.name, tier, "achieved", world);
  if (!output)
    return t("Yield: — (no instant {result} result)", {
      result: t(tierLabel(tier)),
    });
  if (!output?.instant) return t("Yield: — (instant crafting unavailable)");
  const quantity =
    output.quantity === output.maxQuantity
      ? n(output.quantity)
      : `${n(output.quantity)}–${n(output.maxQuantity)}`;
  let result = t(tierLabel(output.tier));
  if (bonusMode(recipe, true, output.tier) === "quality") {
    const stars =
      output.quality === output.maxQuality
        ? n(output.quality)
        : `${n(output.quality)}–${n(output.maxQuality)}`;
    result += ` · ${t(stars === "1" ? "{count} star" : "{count} stars", { count: stars })}`;
  }
  return t("Yield: {quantity} at {result}", { quantity, result });
}

export function acquisitionSources(
  world: World,
  item: Item,
  recipe?: Recipe,
): Source[] {
  // For crafted items, this is where the RECIPE is obtained, not its three outputs.
  const records = world.sources.get(recipe?.name ?? item.name) ?? [];
  const seen = new Set<string>();
  return records.filter((source) => {
    if (source.kind === "recipe") return false;
    const key = JSON.stringify([
      source.label,
      source.location,
      source.availability,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
