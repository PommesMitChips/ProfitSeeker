import {
  Options,
  Output,
  Raw,
  Recipe,
  Tier,
  World,
  num,
  obj,
  str,
} from "../domain/model";
const QUALITY = new Set([
  "clothing",
  "talisman",
  "artefact",
  "mount",
  "cauldron",
  "device",
  "ore_extractor",
]);
const NONE = new Set([
  "recipe",
  "technique",
  "action",
  "enchantment",
  "pillar_shard",
  "mystical_key",
  "condensation_art",
  "blueprint",
  "trophy",
  "upgrade",
  "life_essence",
  "manual",
  "pillar_pattern",
  "local_map",
  "flame",
]);
const NO_SUBLIME_INSTANT = new Set([
  "clothing",
  "talisman",
  "artefact",
  "mount",
  "cauldron",
]);
export function bands(
  progress: number,
  threshold: number,
): { guaranteed: number; fraction: number } {
  if (!(threshold > 0) || progress < 0 || !Number.isFinite(progress))
    return { guaranteed: 0, fraction: 0 };
  let guaranteed = 0;
  while (progress >= threshold && guaranteed < 1000) {
    progress -= threshold;
    guaranteed++;
    threshold = Math.floor(threshold * 1.3);
    if (threshold <= 0) break;
  }
  return {
    guaranteed,
    fraction: Math.max(0, Math.min(1, progress / threshold)),
  };
}
export function bonusMode(
  recipe: Recipe,
  instant: boolean,
  tier: Tier,
): string {
  const output =
    recipe.outputs[instant ? "perfect" : tier] ?? recipe.outputs.perfect;
  const kind = str(output?.raw.kind);
  const mode = str(
    recipe.raw.perfectionEffectOverride,
    QUALITY.has(kind) ? "quality" : NONE.has(kind) ? "none" : "stacks",
  );
  return instant && mode === "stacks" && recipe.outputs.perfect?.quantity === 1
    ? "none"
    : mode;
}
export function resolveOutput(
  recipe: Recipe,
  tier: Tier,
  quality: Options["quality"],
  world: Pick<World, "player" | "flags">,
): Output | undefined {
  // Some consumables have no distinct Sublime item. Their unlocked Perfect
  // repeat produces this same item; do not price a manual base batch instead.
  if (
    tier === "sublime" &&
    !recipe.outputs.sublime &&
    quality === "achieved" &&
    bonusMode(recipe, true, "perfect") === "stacks"
  ) {
    const repeat = resolveOutput(recipe, "perfect", quality, world);
    if (repeat?.instant) return repeat;
  }
  const explicit = recipe.outputs[tier];
  const selected =
    explicit ?? (tier === "sublime" ? recipe.outputs.perfect : undefined);
  if (!selected || selected.quantity <= 0 || recipe.error) return undefined;
  const mode = bonusMode(recipe, false, tier);
  const sublimeAllowed =
    recipe.raw.forceSublimeCrafting === true ||
    (world.flags.pathOfSublimeCraftingComplete === 1 &&
      (mode !== "none" || !!recipe.outputs.sublime));
  if (tier === "sublime" && !sublimeAllowed) return undefined;
  const done = num(recipe.record[`${tier}Count`]) >= 1;
  const permitted =
    done || (tier !== "sublime" && recipe.raw._skillBypass === true);
  const instant =
    recipe.known &&
    permitted &&
    recipe.raw.disableInstantCraft !== true &&
    (tier !== "sublime" ||
      (!!explicit && !NO_SUBLIME_INSTANT.has(str(selected.raw.kind))));
  let quantity = selected.quantity,
    maxQuantity = quantity,
    q = 0,
    maxQuality = 0;
  let basis = instant
    ? done
      ? "Achieved repeat yield"
      : "Base instant output"
    : recipe.known
      ? "Manual craft only"
      : "Planned result";
  if (instant && done && tier !== "basic") {
    if (!recipe.perfection) return undefined;
    const b = bands(num(recipe.record[`${tier}BestResult`]), recipe.perfection);
    const baseline = tier === "perfect" ? 1 : 2;
    const effective = bonusMode(recipe, true, tier);
    if (effective === "stacks") {
      quantity = Math.floor(
        selected.quantity * (1 + 0.2 * (b.guaranteed - baseline)),
      );
      maxQuantity = Math.floor(
        selected.quantity *
          (1 + 0.2 * (b.guaranteed + (b.fraction > 0 ? 1 : 0) - baseline)),
      );
    } else if (effective === "quality" && tier === "sublime") {
      q = Math.max(0, b.guaranteed - 2);
      maxQuality = Math.max(0, b.guaranteed + (b.fraction > 0 ? 1 : 0) - 2);
    }
  }
  if (quality !== "achieved") {
    if (quality > 0 && (tier !== "sublime" || mode !== "quality"))
      return undefined;
    const supported =
      NO_SUBLIME_INSTANT.has(str(selected.raw.kind)) ||
      Object.values(obj(selected.raw.upgradeHarmonies)).some(Boolean);
    if (quality > 0 && !supported) return undefined;
    if (
      quality > 0 &&
      selected.raw.kind === "cauldron" &&
      recipe.raw.harmonyTypeOverride === "captivatingCadence" &&
      !obj(selected.raw.upgradeHarmonies).captivatingCadence
    )
      return undefined;
    if (quality !== q)
      basis =
        instant && quality <= maxQuality
          ? "Conditional repeat quality"
          : "Planned quality";
    q = quality;
  }
  let refundMax = 0;
  if (
    instant &&
    done &&
    sublimeAllowed &&
    bonusMode(recipe, true, tier) !== "none" &&
    recipe.completion
  ) {
    const completion = bands(
      num(recipe.record[`${tier}BestCompletion`]),
      recipe.completion,
    );
    const count = completion.guaranteed + (completion.fraction > 0 ? 1 : 0);
    refundMax = Math.floor(
      (recipe.ingredients.reduce((n, i) => n + i.quantity, 0) *
        Math.max(0, Math.min((count - 1) * 20, 80))) /
        100,
    );
  }
  return quantity > 0
    ? {
        quantity,
        refundMax,
        maxQuantity,
        quality: q,
        maxQuality,
        tier,
        basis,
        instant,
        conditional:
          basis === "Conditional repeat quality" || basis === "Planned quality",
        reason: !instant
          ? "Instant crafting is not available for this selected result."
          : undefined,
      }
    : undefined;
}
export function finance(
  cost: number,
  sale: number,
): { profit: number; roi?: number } {
  return {
    profit: sale - cost,
    roi: cost === 0 ? undefined : ((sale - cost) / cost) * 100,
  };
}

/** Result/star selection is a ceiling, with a supported lower result per item. */
export function resolveItemOutput(
  recipe: Recipe,
  item: string,
  target: Tier,
  quality: Options["quality"],
  world: Pick<World, "player" | "flags">,
): Output | undefined {
  const tiers: Tier[] = ["basic", "perfect", "sublime"];
  const outputs = tiers
    .slice(0, tiers.indexOf(target) + 1)
    .reverse()
    .flatMap((tier) => {
      const selected =
        recipe.outputs[tier] ??
        (tier === "sublime" ? recipe.outputs.perfect : undefined);
      if (selected?.name !== item) return [];
      const achieved = resolveOutput(recipe, tier, "achieved", world);
      const capped =
        quality !== "achieved" && achieved?.instant
          ? Math.min(quality, achieved.maxQuality)
          : quality;
      const output = resolveOutput(recipe, tier, capped, world) ?? achieved;
      return output ? [output] : [];
    });
  return outputs.find((o) => o.instant) ?? outputs[0];
}
