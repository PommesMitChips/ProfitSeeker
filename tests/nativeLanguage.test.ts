import React, { useMemo } from "react";
import { compatibleLanguageHook, loadGameLanguageHook, NativeI18nProvider, GameLanguageState } from "../src/i18n/native";
import { I18n, languageOptions, normalizeLanguage } from "../src/i18n";
import type { GameAPI } from "../src/game/api";

jest.mock("react", () => ({ ...jest.requireActual("react"), useMemo: jest.fn() }));
const api = { utils: { t: (text: string) => text } } as unknown as GameAPI;
const gameUrl = "file:///C:/Games/Ascend/resources/app.asar/dist-electron/index.html";
// A synthetic context hook matching the narrowly supported export signature.
const hook = new Function("q", "vml", "return function yml(){return(0,q.useContext)(vml)}")(
  { useContext: (value: unknown) => value }, { language: "de", translationVersion: 1, isLoading: false },
);
beforeEach(() => (useMemo as jest.Mock).mockImplementation((factory) => factory()));

test("loads the existing local game module and accepts only the verified context export", async () => {
  const load = jest.fn(async () => ({ f: hook }));
  expect(await loadGameLanguageHook(gameUrl, load)).toBe(hook);
  expect(load).toHaveBeenCalledWith("file:///C:/Games/Ascend/resources/app.asar/dist-electron/Game.js");
  expect(compatibleLanguageHook({ f: () => ({ language: "de" }) })).toBeNull();
  expect(compatibleLanguageHook({ f: "changed export" })).toBeNull();
  expect(compatibleLanguageHook({})).toBeNull();
});

test("unrelated pages and failed imports safely fall back without executing a guessed export", async () => {
  const load = jest.fn(async () => ({ f: hook }));
  for (const url of ["http://127.0.0.1:4183/", "https://example.test/dist-electron/index.html", "file:///C:/other/index.html", "invalid"])
    expect(await loadGameLanguageHook(url, load)).toBeNull();
  expect(load).not.toHaveBeenCalled();
  expect(await loadGameLanguageHook(gameUrl, async () => { throw new Error("unavailable"); })).toBeNull();
});

function render(state: GameLanguageState): I18n {
  const element = NativeI18nProvider({ api, children: null, useGameLanguage: () => state });
  return (element.props as { value: I18n }).value;
}

test("native context follows every language switch without storage writes or polling", () => {
  jest.useFakeTimers();
  try {
    for (const code of [...languageOptions.map(([code]) => code), "de", "zh-CN", "en", "de"])
      expect(render({ language: code, translationVersion: 1, isLoading: false }).language).toBe(normalizeLanguage(code));
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test("translation completion invalidates native names even when probe words would stay identical", () => {
  const pending = render({ language: "de", translationVersion: 4, isLoading: true });
  const loaded = render({ language: "de", translationVersion: 5, isLoading: false });
  expect(pending.language).toBe("de");
  expect(loaded.language).toBe("de");
  expect(pending.version).not.toBe(loaded.version);
  expect(loaded.version).toBe(render({ language: "de", translationVersion: 5, isLoading: false }).version);
});

test("invalid native context falls back to the stored-language provider", () => {
  const element = NativeI18nProvider({ api, children: null, useGameLanguage: () => ({} as GameLanguageState) });
  expect((element.type as Function).name).toBe("I18nProvider");
});
