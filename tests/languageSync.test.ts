import React, { useEffect, useMemo, useState } from "react";
import { I18nProvider } from "../src/i18n";
import type { GameAPI } from "../src/game/api";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useEffect: jest.fn(),
  useMemo: jest.fn(),
}));

type Selection = { language: string; probe: string };
let selection: Selection;
let queued: Array<(previous: Selection) => Selection>;
let stored: string | null;
let translated: string;
let start: () => () => void;
let listeners: Map<string, () => void>;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function mount(readStickyState?: () => Promise<string | null>) {
  (useState as jest.Mock).mockImplementation((initial) => {
    selection = initial();
    return [
      selection,
      (next: Selection | ((previous: Selection) => Selection)) =>
        queued.push(typeof next === "function" ? next : () => next),
    ];
  });
  (useEffect as jest.Mock).mockImplementation((effect) => {
    start = effect;
  });
  (useMemo as jest.Mock).mockImplementation((factory) => factory());
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: { getItem: () => stored },
      myFS: readStickyState ? { readStickyState } : undefined,
      setInterval,
      clearInterval,
      addEventListener: (name: string, callback: () => void) =>
        listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
    },
  });
  I18nProvider({
    api: { utils: { t: () => translated } } as unknown as GameAPI,
    children: null,
  });
  return start();
}
function flush() {
  for (const update of queued.splice(0)) selection = update(selection);
}
beforeEach(() => {
  jest.useFakeTimers();
  queued = [];
  listeners = new Map();
  stored = '"en"';
  translated = "English";
});
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("deferred React updates follow English → German → Chinese on the first poll", () => {
  const cleanup = mount();
  expect(selection.language).toBe("en");
  for (const [code, expected] of [
    ["de", "de"],
    ["zh-CN", "zh"],
    ["en", "en"],
  ]) {
    stored = JSON.stringify(code);
    jest.advanceTimersByTime(100);
    // React may execute the updater after the polling callback has returned.
    flush();
    expect(selection.language).toBe(expected);
  }
  cleanup();
});

test("multiple queued polls retain the latest language and refresh native labels separately", () => {
  const cleanup = mount();
  stored = '"de"';
  jest.advanceTimersByTime(500);
  stored = '"zh-TW"';
  jest.advanceTimersByTime(1000);
  flush();
  expect(selection.language).toBe("zh-TW");
  translated = "繁體中文";
  jest.advanceTimersByTime(500);
  flush();
  expect(selection).toEqual({ language: "zh-TW", probe: "繁體中文|繁體中文" });
  cleanup();
  expect(listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test("a late startup settings read cannot overwrite a newer language selection", async () => {
  let finish!: (value: string) => void;
  const cleanup = mount(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  stored = '"de"';
  listeners.get("storage")!();
  flush();
  finish(JSON.stringify({ GameLanguage: "en" }));
  await Promise.resolve();
  flush();
  expect(selection.language).toBe("de");
  cleanup();
});

test("native startup language survives an unchanged stale storage mirror", async () => {
  const cleanup = mount(async () => JSON.stringify({ GameLanguage: "ko" }));
  await Promise.resolve();
  flush();
  jest.advanceTimersByTime(1000);
  flush();
  expect(selection.language).toBe("ko");
  stored = '"de"';
  listeners.get("focus")!();
  flush();
  expect(selection.language).toBe("de");
  cleanup();
});
