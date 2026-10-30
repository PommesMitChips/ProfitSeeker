import React, { useEffect, useMemo, useState } from "react";
import type { GameAPI } from "../game/api";
import { Context, createI18n, I18nProvider, normalizeLanguage } from "./index";

export interface GameLanguageState {
  language: string;
  translationVersion: number;
  isLoading: boolean;
}
export type GameLanguageHook = () => GameLanguageState;

/** Compatibility adapter for the installed game's exported language-context hook.
 * This is internal, not a public mod API. Reject a changed export rather than
 * calling an arbitrary function after a game update. Never modify game settings.
 */
export function compatibleLanguageHook(module: Record<string, unknown>): GameLanguageHook | null {
  const hook = module.f;
  if (typeof hook !== "function") return null;
  return /^function yml\(\)\s*\{\s*return\s*\(0,\s*q\.useContext\)\(vml\);?\s*\}$/.test(
    Function.prototype.toString.call(hook),
  ) ? hook as GameLanguageHook : null;
}

export async function loadGameLanguageHook(
  documentUrl: string,
  load: (url: string) => Promise<Record<string, unknown>> =
    (url) => import(/* webpackIgnore: true */ url),
): Promise<GameLanguageHook | null> {
  try {
    const url = new URL(documentUrl);
    // Reuse the already-loaded Electron module; never import from a website.
    if (url.protocol !== "file:" || !url.pathname.endsWith("/dist-electron/index.html")) return null;
    return compatibleLanguageHook(await load(new URL("Game.js", url).href));
  } catch {
    return null;
  }
}

type Props = { api: GameAPI; children: React.ReactNode };
export function NativeI18nProvider({ api, children, useGameLanguage }: Props & {
  useGameLanguage: GameLanguageHook;
}) {
  const state = useGameLanguage();
  const language = normalizeLanguage(state?.language);
  const value = useMemo(() => createI18n(
    language, api,
    `${language}:${state?.translationVersion}:${state?.isLoading}`,
  ), [api, language, state?.translationVersion, state?.isLoading]);
  if (!state || typeof state.language !== "string" || typeof state.translationVersion !== "number")
    return <I18nProvider api={api}>{children}</I18nProvider>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Subscribe through React itself, including translation-load completion.
 * Resolve before mounting the launcher so selecting the adapter never remounts
 * an open panel or creates a competing storage watcher.
 */
export function GameI18nProvider({ api, children }: Props) {
  const [hook, setHook] = useState<GameLanguageHook | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void loadGameLanguageHook(document.location.href).then((found) => {
      if (!cancelled) setHook(() => found);
    });
    return () => { cancelled = true; };
  }, []);
  if (hook === undefined) return null;
  return hook
    ? <NativeI18nProvider api={api} useGameLanguage={hook}>{children}</NativeI18nProvider>
    : <I18nProvider api={api}>{children}</I18nProvider>;
}
