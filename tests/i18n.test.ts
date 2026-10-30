import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  catalogs,
  createI18n,
  normalizeLanguage,
  Language,
  languageOptions,
} from "../src/i18n";
import { instantYieldLabel } from "../src/query/itemPreview";
import { caravanDirections } from "../src/ui/Caravan";
import { item, recipe, world } from "./helpers";
import { CaravanPlan } from "../src/planner/caravan";

test("farming route descriptions translate source components independently", () => {
  const step = {
    kind: "farm" as const,
    item: "Leaf",
    quantity: 3,
    cost: 0,
    label: "Herb garden · Valley",
    sourceLabel: "Herb garden",
    sourceLocation: "Valley",
  };
  for (const language of Object.keys(catalogs).filter(
    (l) => l !== "en",
  ) as Language[]) {
    const i18n = createI18n(language);
    expect(i18n.stepLabel(step)).toBe(
      `${catalogs[language]["Herb garden"]} · Valley`,
    );
    expect(i18n.stepLabel(step)).not.toContain("Herb garden");
  }
});

test("catalogs cover the same messages and preserve interpolation placeholders", () => {
  const keys = Object.keys(catalogs.en).sort();
  const tokens = (s: string) =>
    [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const language of Object.keys(catalogs) as Language[]) {
    expect(Object.keys(catalogs[language]).sort()).toEqual(keys);
    for (const key of keys) {
      expect(catalogs[language][key].trim()).not.toBe("");
      expect(tokens(catalogs[language][key])).toEqual(tokens(key));
    }
  }
});
test("reads game language codes, sticky-state JSON and falls back to English", () => {
  expect(normalizeLanguage('"ru"')).toBe("ru");
  expect(normalizeLanguage("ru_RU")).toBe("ru");
  expect(normalizeLanguage("zh-CN")).toBe("zh");
  expect(normalizeLanguage("ko-KR")).toBe("ko");
  expect(normalizeLanguage("fr")).toBe("fr");
  expect(normalizeLanguage("po")).toBe("pl");
  expect(normalizeLanguage("pt-BR")).toBe("pt-BR");
  expect(normalizeLanguage("zh-TW")).toBe("zh-TW");
  expect(normalizeLanguage("zh-Hant")).toBe("zh-TW");
  expect(normalizeLanguage("unsupported")).toBe("en");
  expect(
    new Set(languageOptions.map(([code]) => normalizeLanguage(code))).size,
  ).toBe(13);
  expect(normalizeLanguage(null)).toBe("en");
  expect(createI18n("ru").n(1234.5)).toBe(
    new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(1234.5),
  );
  expect(createI18n("ru").p(7.5)).toBe(
    new Intl.NumberFormat("ru-RU", {
      style: "percent",
      maximumFractionDigits: 2,
    }).format(0.075),
  );
  expect(createI18n("ko").t("unregistered text")).toBe("unregistered text");
});
test("yield and persisted caravan instructions localize without altering quantities or identifiers", () => {
  const output = item("Pill", { kind: "pill" }),
    r = recipe("Recipe", output, [], 10),
    w = world([output], [r]);
  r.record.perfectBestResult = 295;
  expect(instantYieldLabel(output, r, "perfect", w, createI18n("zh"))).toBe(
    "产量：12–14 · 完美",
  );
  const plan = {
    trades: [
      {
        item: "Pill",
        itemName: "Pill",
        key: "Pill",
        quantity: 2,
        buyAt: "A",
        buyId: "A",
        sellAt: "B",
        sellId: "B",
        cost: 10,
        sale: 15,
        toBuyDays: 0,
        toSellDays: 2,
        carried: false,
        cashAfter: 30,
      },
    ],
    tracked: [],
  } as unknown as CaravanPlan;
  const steps = caravanDirections(plan, createI18n("ko"));
  expect(steps[0]).toBe("A에서 Pill 2개 구매 · 20 영석");
  expect(steps[1]).toBe("B(으)로 이동 · 2일");
  expect(plan.trades[0].key).toBe("Pill");
});
test("UI text and explicit translation keys are cataloged", () => {
  for (const file of fs
    .readdirSync(path.join(__dirname, "../src/ui"))
    .filter((f) => f.endsWith(".tsx"))) {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(__dirname, "../src/ui", file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node))
        expect(node.text.replace(/\s+/g, " ").trim()).not.toMatch(/[A-Za-z]/);
      if (
        ts.isCallExpression(node) &&
        (node.expression.getText(source) === "t" ||
          node.expression.getText(source) === "i18n.t") &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        expect(catalogs.en[node.arguments[0].text]).toBeDefined();
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});
