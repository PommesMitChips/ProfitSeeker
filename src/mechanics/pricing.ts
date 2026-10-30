import {
  Item,
  Market,
  Metric,
  Raw,
  list,
  missing,
  num,
  obj,
  str,
  value,
} from "../domain/model";
import type { GameAPI } from "../game/api";
export const SELL: Record<string, number> = {
  technique: 400,
  artefact: 850,
  clothing: 350,
  talisman: 600,
  pill: 200,
  concoction: 200,
  consumable: 300,
  material: 30,
  treasure: 150,
  cauldron: 450,
  flame: 750,
  breakthrough: 500,
  fruit: 250,
  recuperation: 10,
  recipe: 10,
  mount: 1000,
  elixir: 120,
  flare: 0,
  action: 200,
  transport_seal: 50,
  enchantment: 500,
  mystical_key: 200,
  condensation_art: 1000,
  formation: 250,
  pillar_shard: 350,
  trophy: 0,
  blueprint: 1000,
  token: 0,
  misc: 0,
  upgrade: 1000,
  reagent: 150,
  life_essence: 1000,
  device: 600,
  ore_extractor: 600,
  manual: 0,
  pillar_pattern: 500,
  local_map: 100,
};
export const BUY: Record<string, number> = {
  technique: 3000,
  artefact: 3500,
  clothing: 1200,
  talisman: 2000,
  pill: 400,
  concoction: 400,
  consumable: 650,
  material: 80,
  treasure: 250,
  cauldron: 2500,
  flame: 3000,
  breakthrough: 4000,
  fruit: 350,
  recuperation: 100,
  recipe: 400,
  mount: 3000,
  elixir: 1000,
  flare: 65,
  action: 2000,
  transport_seal: 450,
  enchantment: 2000,
  mystical_key: 700,
  condensation_art: 3000,
  formation: 1000,
  pillar_shard: 2000,
  trophy: 2000,
  blueprint: 4500,
  token: 500,
  misc: 500,
  upgrade: 4000,
  reagent: 500,
  life_essence: 5000,
  device: 2500,
  ore_extractor: 3500,
  manual: 15000,
  pillar_pattern: 3000,
  local_map: 1000,
};
const REALM_FACTOR: Record<string, number> = {
  mundane: 0.5,
  bodyForging: 1,
  meridianOpening: 2.5,
  qiCondensation: 5,
  coreFormation: 8.5,
  pillarCreation: 13,
  lifeFlourishing: 18.5,
  worldShaping: 25,
  innerGenesis: 32.5,
  soulAscension: 40,
  any: 1,
};
const RARITY = [
  "mundane",
  "qitouched",
  "empowered",
  "resplendent",
  "incandescent",
  "transcendent",
];
const RARITY_FACTOR = [1, 1.2, 1.6, 2, 2.5, 4];
export const saleable = (item: Raw): boolean =>
  item.valueTier !== 0 &&
  item.kind !== "pillar_pattern" &&
  str(item.kind) in SELL;
function shift(x: number): number {
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return x;
}
/** Mirrors the game's seeded name factor; no random stream is touched. */
export function nameFactor(name: string): number {
  for (const word of [
    "Blood",
    "Blossom",
    "Fist",
    "Cloud",
    "Weapon",
    "Celestial",
    "Neutral",
  ])
    name = name.replace(word, "");
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    hash = shift(hash);
  }
  const n = shift(hash || 1);
  return ((n - -2147483648) / (2147483647 - -2147483648)) * 0.2 + 0.9;
}
export function unitPrice(
  item: Raw,
  base: Record<string, number>,
  multiplier: number,
  modifier = 1,
  charisma = 1,
  quality?: number,
): Metric {
  const rarity = RARITY_FACTOR[RARITY.indexOf(str(item.rarity))];
  const realm = REALM_FACTOR[str(item.realm)];
  const kindValue = base[str(item.kind)];
  if (rarity === undefined || realm === undefined || kindValue === undefined)
    return missing("Unsupported item price metadata.");
  const enchantment = obj(item.enchantment);
  const enchant = item.enchantment
    ? 1 + (RARITY.indexOf(str(enchantment.rarity)) + 1) * 0.075
    : 1;
  const q = quality ?? num(obj(item.harmonyAugment).quality);
  let price = Math.floor(
    kindValue *
      realm *
      rarity *
      (num(item.valueTier) > 0 ? num(item.valueTier) : 1) *
      multiplier *
      modifier *
      charisma *
      enchant *
      (1 + q * 0.15) *
      nameFactor(str(item.name)),
  );
  if (item.realm === "mundane") price = Math.ceil(price / 10);
  return value(price);
}
export const salePrice = (
  item: Item,
  market: Market,
  quality?: number,
): Metric =>
  saleable(item.raw)
    ? unitPrice(item.raw, SELL, 1 + market.bonus, 1, 1, quality)
    : missing("This item cannot be sold.", "unavailable");
export function purchasePrice(
  item: Raw,
  market: Market,
  valueModifier: number,
  discount?: number,
): Metric {
  if (discount === undefined)
    return missing("Effective charisma discount is unavailable.");
  const cost = unitPrice(
    item,
    BUY,
    Math.max(0.1, market.multiplier - market.bonus),
    valueModifier,
    discount,
  );
  const floor = unitPrice(item, SELL, 1 + market.bonus, valueModifier);
  return cost.state === "value" && floor.state === "value"
    ? value(Math.max(cost.value, floor.value))
    : missing("Purchase quote is unresolved.");
}
export function effectiveCharisma(
  api: GameAPI,
  player: Raw,
  breakthrough: Raw,
): number | undefined {
  if (!api.utils.getFullItem || !api.utils.getDestinies) return undefined;
  let total = num(obj(player.socialStats).charisma, NaN);
  for (const buff of list(player.monthBuffs))
    total +=
      num(buff.charisma) *
      (buff.charismaScalesWithRoomEffectiveness
        ? 1 + num(obj(buff.additionalVariables).roomEffectiveness) / 100
        : 1);
  const equipment = [
    player.clothing,
    ...list(player.talismans),
    ...list(player.artefacts),
    player.mount,
  ];
  try {
    for (const descriptor of equipment) {
      if (!str(obj(descriptor).name)) continue;
      const item = obj(api.utils.getFullItem(obj(descriptor)));
      total += num(item.charisma) + num(obj(item.enchantment).charisma);
    }
    const art = obj(obj(breakthrough.qiCondensation).art);
    if (art.enchantment)
      total += num(obj(obj(api.utils.getFullItem(art)).enchantment).charisma);
    for (const destiny of api.utils.getDestinies(player))
      total += num(obj(destiny).charisma);
    const bgs = obj(api.gameData.backgrounds);
    const background = [...list(bgs.child), ...list(bgs.treasures)];
    for (const name of Array.isArray(player.background)
      ? player.background
      : []) {
      total *= num(
        background.find((b) => b.name === name)?.charismaMultiplier,
        1,
      );
    }
  } catch {
    return undefined;
  }
  return Number.isFinite(total) ? total : undefined;
}
