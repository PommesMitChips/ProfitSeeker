export type Raw = Record<string, unknown>;
export const obj = (x: unknown): Raw =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Raw) : {};
export const list = (x: unknown): Raw[] => (Array.isArray(x) ? x.map(obj) : []);
export const str = (x: unknown, fallback = ""): string =>
  typeof x === "string" ? x : fallback;
export const num = (x: unknown, fallback = 0): number =>
  typeof x === "number" && Number.isFinite(x) ? x : fallback;
export type Tier = "basic" | "perfect" | "sublime";
export type Availability =
  | "available"
  | "locked"
  | "possible"
  | "unknown"
  | "exhausted";
export type Metric =
  | { state: "value"; value: number; lower?: number }
  | { state: "unknown" | "unavailable" | "undefined"; reason: string };
export const value = (n: number): Metric =>
  Number.isFinite(n)
    ? { state: "value", value: n }
    : { state: "unknown", reason: "The game did not provide a finite value." };
export const missing = (
  reason: string,
  state: "unknown" | "unavailable" = "unknown",
): Metric => ({ state, reason });
export const REALMS = [
  "mundane",
  "bodyForging",
  "meridianOpening",
  "qiCondensation",
  "coreFormation",
  "pillarCreation",
  "lifeFlourishing",
  "worldShaping",
  "innerGenesis",
  "soulAscension",
];
export const REALM_LABELS = [
  "Mundane",
  "Body Forging",
  "Meridian Opening",
  "Qi Condensation",
  "Core Formation",
  "Pillar Creation",
  "Life Flourishing",
  "World Shaping",
  "Inner Genesis",
  "Soul Ascension",
];
export const realmLabel = (realm: string): string =>
  REALM_LABELS[REALMS.indexOf(realm)] ?? realm;
export interface Item {
  key: string;
  name: string;
  label: string;
  description: string;
  kind: string;
  realm: string;
  icon: string;
  raw: Raw;
}
export interface Ingredient {
  name: string;
  quantity: number;
}
export interface Recipe {
  name: string;
  raw: Raw;
  ingredients: Ingredient[];
  outputs: Partial<Record<Tier, { name: string; quantity: number; raw: Raw }>>;
  known: boolean;
  record: Raw;
  perfection?: number;
  completion?: number;
  error?: string;
}
export interface Source {
  id: string;
  item: string;
  label: string;
  location: string;
  kind: "buy" | "farm" | "recipe" | "reward";
  availability: Availability;
  quantity?: number;
  repeatable: boolean;
  reason?: string;
  currency?: string;
  cost?: Metric;
  raw?: Raw;
  acquires?: "inventory" | "knowledge";
  marketId?: string;
  stockItem?: Raw;
}
export interface Market {
  id: string;
  name: string;
  availability: Availability;
  bonus: number;
  multiplier: number;
  reason?: string;
  raw: Raw;
  known?: boolean;
}
export interface InventoryEntry {
  key: string;
  name: string;
  label: string;
  quantity: number;
  place: "inventory" | "storage";
  raw: Raw;
}
export interface Options {
  tier: Tier;
  quality: "achieved" | number;
  buy: boolean;
  farm: boolean;
  inventory: boolean;
}
export interface Filters {
  search: string;
  realm: string;
  known: boolean;
  craftNow: boolean;
  craftable: boolean;
}
export type SortKey = "item" | "cost" | "sale" | "profit" | "roi";
export interface Preferences {
  filters: Filters;
  options: Options;
  sort: { key: SortKey; descending: boolean };
  reservations: Record<string, number>;
  marketIds?: string[];
}
export const defaults = (): Preferences => ({
  filters: {
    search: "",
    realm: "all",
    known: true,
    craftNow: false,
    craftable: false,
  },
  options: {
    tier: "perfect",
    quality: "achieved",
    buy: true,
    farm: false,
    inventory: true,
  },
  sort: { key: "profit", descending: true },
  reservations: {},
});
export interface World {
  items: Map<string, Item>;
  recipes: Recipe[];
  recipesByOutput: Map<string, Recipe[]>;
  sources: Map<string, Source[]>;
  markets: Market[];
  inventory: InventoryEntry[];
  player: Raw;
  flags: Record<string, number>;
  charisma?: number;
  revision: number;
  issues: string[];
  gameVersion: string;
  pricingVerified: boolean;
}
export interface Output {
  refundMax?: number;
  quantity: number;
  maxQuantity: number;
  quality: number;
  maxQuality: number;
  tier: Tier;
  basis: string;
  instant: boolean;
  conditional: boolean;
  reason?: string;
}
export interface Step {
  kind: "inventory" | "intermediate" | "farm" | "buy" | "craft";
  item: string;
  quantity: number;
  label: string;
  sourceLabel?: string;
  sourceLocation?: string;
  cost: number;
  recipe?: string;
  output?: Output;
}
export interface Route {
  refundCreditMax?: number;
  id: string;
  cost: number;
  quantity: number;
  steps: Step[];
  basis: string;
  quality: number;
  output?: Output;
  recipe?: Recipe;
}
export interface Quote {
  market: string;
  marketId?: string;
  price: Metric;
  availability: Availability;
  reason?: string;
}
export interface Alternative {
  route: Route;
  quote: Quote;
  cost: number;
  sale: number;
  profit: number;
  roi?: number;
}
export interface Row {
  item: Item;
  cost: Metric;
  sale: Metric;
  profit: Metric;
  roi: Metric;
  route?: Route;
  quotes: Quote[];
  alternatives: Alternative[];
  reason?: string;
  complete: boolean;
}
