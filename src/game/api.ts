import type React from "react";
import type { Raw } from "../domain/model";
export interface ScreenAPI {
  hasSave: boolean;
  useSelector: <T>(selector: (state: Raw) => T) => T;
  useGameFlags: () => { flags: Record<string, number>; flagsJSON: string };
  actions?: { setModData?: (mod: string, key: string, value: unknown) => void };
  components?: Raw;
}
export interface GameAPI {
  gameData: Raw;
  injectUI?: (
    slot: string,
    generator: (
      screenAPI: ScreenAPI,
      insert: (
        selector: string,
        content: React.ReactNode,
        placement?: string,
      ) => void,
    ) => void,
  ) => void;
  actions: {
    addTab: (
      slot: string,
      config: {
        id: string;
        title: string;
        component: React.ComponentType<{ screenAPI: ScreenAPI }>;
      },
    ) => void;
  };
  utils: {
    getFullItem?: (descriptor: Raw) => unknown;
    getItemKey?: (descriptor: Raw) => string;
    getHasSaveLoaded?: () => boolean;
    deriveRecipeDifficulty?: (
      recipe: Raw,
      flags: Record<string, number>,
    ) => Raw;
    evalExp?: (expression: string, flags: Record<string, number>) => number;
    getDestinies?: (player: Raw) => unknown[];
    getCharismaDiscount?: (charisma: number, realm: string) => number;
    getCraftSkillCap?: (realm: string, progress: string) => number;
    discoverUnlockedLocations?: (flags: Record<string,number>, locations:Raw[]) => void;
    getMoveSpeedMultiplier?: (player:Raw,breakthrough:Raw) => number;
    t?: (text: string) => string;
  };
  hooks: {
    onDeriveRecipeDifficulty?: (
      callback: (recipe: Raw, stats: Raw, flags: Record<string, number>) => Raw,
    ) => () => void;
  };
  getGameStateSnapshot: () => Raw | null;
  subscribe: (callback: () => void) => () => void;
}
declare global {
  interface Window {
    modAPI?: GameAPI;
    __profitSeekerRegistered?: boolean;
  }
}

/** Observes the public post-modifier callback. Never edits game objects. */
export class RecipeReader {
  private pending: {
    name: string;
    flags: Record<string, number>;
    result?: Raw;
  }[] = [];
  private unsubscribe?: () => void;
  constructor(private api: GameAPI) {
    this.unsubscribe = api.hooks.onDeriveRecipeDifficulty?.(
      (recipe, stats, flags) => {
        const request = this.pending.at(-1);
        if (
          request &&
          request.name === recipe.name &&
          request.flags === flags
        ) {
          request.result = structuredClone(recipe);
        }
        return stats;
      },
    );
  }
  read(
    recipe: Raw,
    flags: Record<string, number>,
  ): { recipe: Raw; stats: Raw } {
    if (!this.unsubscribe || !this.api.utils.deriveRecipeDifficulty)
      throw new Error("Effective recipe access is unavailable.");
    const request: {
      name: string;
      flags: Record<string, number>;
      result?: Raw;
    } = { name: String(recipe.name), flags };
    this.pending.push(request);
    try {
      const stats = this.api.utils.deriveRecipeDifficulty(
        structuredClone(recipe),
        flags,
      );
      if (!request.result)
        throw new Error("The game did not return the effective recipe.");
      return { recipe: request.result, stats };
    } finally {
      this.pending.pop();
    }
  }
  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.pending = [];
  }
}

export function evaluateCondition(
  api: GameAPI,
  expression: unknown,
  flags: Record<string, number>,
): boolean | undefined {
  if (expression === undefined || expression === "" || expression === "1")
    return true;
  if (typeof expression === "number") return expression !== 0;
  if (
    typeof expression !== "string" ||
    expression.includes("{rng}") ||
    expression.includes("__rng__")
  )
    return undefined;
  if (!api.utils.evalExp) return undefined;
  try {
    const result = api.utils.evalExp(expression, flags);
    return Number.isFinite(result) ? result !== 0 : undefined;
  } catch {
    return undefined;
  }
}
