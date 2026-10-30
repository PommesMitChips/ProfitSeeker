import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "./en.json";
import ru from "./ru.json";
import zh from "./zh.json";
import ko from "./ko.json";
import es from "./es.json";
import de from "./de.json";
import fr from "./fr.json";
import ja from "./ja.json";
import pt from "./pt-BR.json";
import th from "./th.json";
import pl from "./pl.json";
import vi from "./vi.json";
import zhTW from "./zh-TW.json";
import type { GameAPI } from "../game/api";
import type { Step } from "../domain/model";
export type Language =
  | "en"
  | "ru"
  | "zh"
  | "ko"
  | "es"
  | "de"
  | "fr"
  | "ja"
  | "pt-BR"
  | "th"
  | "pl"
  | "vi"
  | "zh-TW";
export const languageOptions: [string, string][] = [
  ["en", "English"],
  ["ru", "Русский"],
  ["zh-CN", "简体中文"],
  ["es", "Español"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["ja", "日本語"],
  ["pt-BR", "Português-Brasil"],
  ["th", "ไทย"],
  ["ko", "한국어"],
  ["po", "Polski"],
  ["vi", "Tiếng Việt"],
  ["zh-TW", "繁體中文"],
];
export const catalogs: Record<Language, Record<string, string>> = {
  en,
  ru,
  zh,
  ko,
  es,
  de,
  fr,
  ja,
  "pt-BR": pt,
  th,
  pl,
  vi,
  "zh-TW": zhTW,
};
export function normalizeLanguage(value: unknown): Language {
  if (typeof value !== "string") return "en";
  let code = value;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") code = parsed;
  } catch {}
  code = code.toLowerCase().replace("_", "-");
  const aliases: Record<string, Language> = {
    russian: "ru",
    korean: "ko",
    schinese: "zh",
    tchinese: "zh-TW",
    po: "pl",
    brazilian: "pt-BR",
    pt: "pt-BR",
  };
  if (aliases[code]) return aliases[code];
  if (code.startsWith("zh")) return /tw|hk|hant/.test(code) ? "zh-TW" : "zh";
  const base = code.split("-")[0];
  return aliases[base] ?? (base in catalogs ? (base as Language) : "en");
}
export function createI18n(
  language: Language,
  api?: GameAPI,
  version: string = language,
) {
  const locale = {
    en: "en-US",
    ru: "ru-RU",
    zh: "zh-CN",
    ko: "ko-KR",
    es: "es-ES",
    de: "de-DE",
    fr: "fr-FR",
    ja: "ja-JP",
    "pt-BR": "pt-BR",
    th: "th-TH",
    pl: "pl-PL",
    vi: "vi-VN",
    "zh-TW": "zh-TW",
  }[language];
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    percent = new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 2,
    });
  const n = (value: number) =>
    Number.isFinite(value)
      ? formatter.format(value)
      : catalogs[language].Unknown;
  const t = (key: string, params: Record<string, string | number> = {}) =>
    (catalogs[language][key] ?? catalogs.en[key] ?? key).replace(
      /\{(\w+)\}/g,
      (match, id) =>
        params[id] === undefined
          ? match
          : typeof params[id] === "number"
            ? n(params[id] as number)
            : String(params[id]),
    );
  const gameText = (text: string) => {
    try {
      return api?.utils.t?.(text) || text;
    } catch {
      return text;
    }
  };
  const location = (id: string, fallback = id) => {
    const raw = api?.gameData.locations as
      | Record<string, Record<string, unknown>>
      | undefined;
    const entry = raw?.[id];
    const name = entry?.displayName;
    return gameText(
      typeof name === "string" && name
        ? name
        : entry
          ? String(entry.name ?? id)
          : fallback,
    );
  };
  return {
    language,
    locale,
    version,
    t,
    n,
    p: (value: number) => percent.format(value / 100),
    gameText,
    location,
    stepLabel: (step: Step) =>
      step.sourceLabel
        ? `${gameText(t(step.sourceLabel))} · ${gameText(step.sourceLocation ?? "")}`
        : gameText(t(step.label)),
    realm: (text: string) => {
      const translated = gameText(text);
      return translated !== text ? translated : t(text);
    },
  };
}
export type I18n = ReturnType<typeof createI18n>;
export const english = createI18n("en");
const Context = createContext<I18n>(english);
export const useI18n = () => useContext(Context);
export function I18nProvider({
  api,
  children,
}: {
  api: GameAPI;
  children: React.ReactNode;
}) {
  const read = () => {
    try {
      return window.localStorage.getItem("GameLanguage");
    } catch {
      return null;
    }
  };
  const probe = () => {
    try {
      return `${api.utils.t?.("Body Forging") ?? ""}|${api.utils.t?.("Market") ?? ""}`;
    } catch {
      return "";
    }
  };
  const [selection, setSelection] = useState(() => ({
    language: normalizeLanguage(read()),
    probe: probe(),
  }));
  useEffect(() => {
    let cancelled = false,
      last = read();
    let lastProbe=probe();
    const initialRaw = last;
    // Current game persists sticky settings to disk; localStorage is updated on
    // every language change, but may be stale at startup after synchronization.
    const native = window as unknown as {
      myFS?: { readStickyState?: () => Promise<string | null> };
    };
    native.myFS
      ?.readStickyState?.()
      .then((raw) => {
        if (cancelled || read() !== initialRaw || !raw) return;
        try {
          const settings = JSON.parse(raw);
          if (settings.GameLanguage)
            setSelection({
              language: normalizeLanguage(settings.GameLanguage),
              probe: probe(),
            });
        } catch {}
      })
      .catch(() => {});
    const refresh = () => {
      const next = read(),
        label = probe(),
        languageChanged = next !== last;
      if (!languageChanged && label===lastProbe) return;
      lastProbe=label;
      // React may defer or replay the updater. Capture the comparison before
      // advancing the polling cursor instead of reading mutable `last` inside it.
      last = next;
      setSelection((old) => {
        const language = languageChanged
          ? normalizeLanguage(next)
          : old.language;
        return old.language === language && old.probe === label
          ? old
          : { language, probe: label };
      });
    };
    const timer = window.setInterval(refresh, 100);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [api]);
  const value = useMemo(
    () =>
      createI18n(
        selection.language,
        api,
        `${selection.language}:${selection.probe}`,
      ),
    [selection, api],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
