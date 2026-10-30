# Profit Seeker

An in-game crafting and trading calculator for **Ascend From Nine Mountains**.
Compare ways to earn spirit stones, find market opportunities, and follow a
caravan plan from a compact overlay.

**Current release:** `0.3.0-alpha.5` · **Target game version:** `0.7.18-97c093b`

[Download a release](https://github.com/PommesMitChips/ProfitSeeker/releases) ·
[Report an issue](https://github.com/PommesMitChips/ProfitSeeker/issues) ·
[MIT license](LICENSE)

## Install

1. Download **Profit.Seeker.zip** from a release. GitHub's automatic source-code
   archives are for developers, not for installation.
2. Place the ZIP in the game's `mods` folder **without extracting it**. On a
   typical Windows Steam installation this is:

   ```text
   C:\Program Files (x86)\Steam\steamapps\common\Ascend From Nine Mountains\mods
   ```

3. Restart the game and enable **Profit Seeker** in its mod manager.
4. Load your character and click the **golden scales** button. Drag the button
   to move it; its position is remembered.

To update, replace the existing ZIP and restart the game. Disable or remove the
ZIP to uninstall. The mod uses its own `afnm-profitseeker` save-data namespace.

## Crafting

The table has five sortable columns: **Item, Cost, Sale price, Profit and ROI**.

- Search across names, descriptions, ingredients and places. Each word is a
  separate keyword; matches are ranked by relevance.
- Filter by realm, known recipes, craftable items, or items craftable now.
- Choose whether to buy ingredients, gather them, or use ingredients you own.
- Set a crafting-result and star target. These act as ceilings: each item falls
  back to a supported lower result, preferring an unlocked repeat craft.
- Hover an item icon for repeat yield, its recipe and recipe acquisition.
  Ingredient hovers show sources and prices. Hover a number for ranked
  alternatives; click to pin details and plan a desired output quantity.

The calculator reads achieved repeat records and effective recipe difficulty.
It keeps crafting result, gold stars and completion/perfection progress separate.
Numeric details identify the result and stars used in that row.

### Cost and profit

All figures in the table are **per finished item**. Cost uses the full batches
needed for the requested output and the guaranteed repeat yield.

When ingredient refunds are possible, Cost can show a range. The lower end
includes the greatest possible replacement-cost saving on directly purchased
ingredients; the upper end is the full upfront cost. Refunds are random, and all
inputs must be available before crafting. Nested-craft refund credits are omitted
when their cost cannot be attributed reliably.

**Profit = sale price − upfront cost**

**ROI = profit ÷ upfront cost × 100%**

Profit, ROI and cost sorting use the upper, upfront cost. Zero-cost ROI is shown
as `—`. Existing or freely gathered ingredients add no spirit-stone purchase
cost; their time and alternative sale value are not included.

## Arbitrage and caravans

The **Arbitrage** tab compares buying and reselling the same item. It uses
confirmed stock, item variants and available quantities. The **Markets** button
selects which known-location markets participate in both tabs.

**Plan Caravan** uses your current spirit stones and travel times in days to
search for profitable sequences. Multiple goods can share a journey. The search
is bounded, so “best plan found” is not a guarantee of a global optimum.

- Optionally keep the plan updated as conditions change.
- Show a collapsible overlay while playing normally.
- See all purchases and sales for one stop together. Next/Previous moves between
  locations, not individual items.
- Track expected and gained profit per order, plus caravan totals.

Gained profit subtracts acquisition costs from confirmed sale proceeds. Progress
is inferred from inventory, stock, prices and cash changes; ambiguous activity is
flagged and excluded from confirmed gains. Filled-order history survives plan
refreshes until you clear the plan.

Profit Seeker provides information and planning. It does not automatically buy,
sell, craft or travel.

## Languages

The mod follows the game's language setting automatically:

English, Русский, 简体中文, Español, Deutsch, Français, 日本語,
Português-Brasil, ไทย, 한국어, Polski, Tiếng Việt and 繁體中文.

Simplified and Traditional Chinese have separate catalogs. Native item and
location names use the game's translations. Numbers, percentages and name sorting
follow the selected locale. Unsupported languages fall back to English.

## Alpha status and limitations

This is an early release. Calculations have automated regression coverage and a
browser fixture preview; comprehensive in-game price, yield and compatibility
testing is still ongoing.

- Pricing rules currently target the game version above. Other versions may
  show unverified values rather than silently applying incompatible rules.
- NPC/guild shops, event rewards and exact mine/garden prerequisites are not
  completely covered. Unconfirmed sources do not fund guaranteed routes.
- Travel events and future market restocks are not predicted.
- Caravan progress cannot reliably recover transactions missed between
  observations.
- Large crafting searches have a work limit and report incomplete comparisons.

For a useful bug report, include the game/mod versions, language, selected
calculator options, item/recipe, expected values and a screenshot. You do not
need to publish your save file.

## Development

Use Node.js 20 or newer and npm. No game installation is required to build or run
the tests. React and Material UI are supplied by the game in the production mod.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
node scripts/check-bundle.cjs
```

The installable archive is written to `builds/Profit Seeker.zip`. It contains
`mod.js`, `package.json` and `LICENSE`.

To run the standalone preview:

```sh
npm run harness:build
npm run harness:serve
```

Open <http://127.0.0.1:4182/>. The preview uses illustrative fixtures and does not
read or change a game save. Its language selector and simulation buttons are
development controls, not part of the in-game mod.

### Project layout

| Directory | Purpose |
| --- | --- |
| `src/catalogue`, `src/game` | Game-data adapters |
| `src/mechanics`, `src/planner` | Pricing, crafting and caravan calculations |
| `src/query`, `src/state` | Filtering, caching, preferences and progress |
| `src/ui` | In-game panels, hovers, launcher and overlay |
| `src/i18n` | Translation catalogs and locale handling |
| `harness` | Standalone development preview |
| `tests` | Regression tests and numeric reference fixtures |
| `scripts` | Packaging, preview server and bundle checks |

Translation contributions are welcome. Preserve each catalog's message keys and
`{placeholders}`; the tests check parity across all languages.

## License

Profit Seeker is released under the [MIT License](LICENSE).
Ascend From Nine Mountains and its assets belong to their respective owners.
This repository contains no extracted game source or game assets and is not an
official game release.
