import { useI18n, english, I18n } from "../i18n";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Tabs,
  Tab,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Filters,
  Item,
  Metric,
  Options,
  Preferences,
  Raw,
  Row,
  SortKey,
  World,
  defaults,
  num,
  obj,
  realmLabel,
  str,
  REALMS,
} from "../domain/model";
import { GameAPI, RecipeReader, ScreenAPI } from "../game/api";
import { tierLabel } from "../query/itemPreview";
import { readWorld } from "../catalogue/readWorld";
import { evaluateRow } from "../planner/engine";
import { clampPage, matchScore, sortRows, visibleItems } from "../query/query";
import { MOD_ID, readPreferences } from "../state/preferences";
import { ItemPreview, NativeItemComponent, withinPreview } from "./ItemPreview";

import { selectMarkets } from "../query/markets";
import { MarketSelector } from "./MarketSelector";
import { ProfitData, useProfitWorld, cacheCraft } from "../state/runtime";
import { ArbitragePanel } from "./ArbitragePanel";

const plain = (s: string) => s.replace(/<[^>]*>/g, "");
export function metricText(
  metric: Metric,
  key?: SortKey,
  i18n: I18n = english,
): string {
  return metric.state === "value"
    ? key === "roi"
      ? i18n.p(metric.value)
      : metric.lower !== undefined && metric.lower < metric.value
        ? `${i18n.n(metric.lower)}–${i18n.n(metric.value)}`
        : i18n.n(metric.value)
    : metric.state === "undefined"
      ? "—"
      : metric.state === "unavailable"
        ? i18n.t("Unavailable")
        : i18n.t("Unknown");
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  return (
    <FormControlLabel
      sx={{ m: 0, mr: 1 }}
      control={
        <Checkbox
          size="small"
          checked={checked}
          onChange={(_, next) => onChange(next)}
        />
      }
      label={<Typography variant="body2">{label}</Typography>}
    />
  );
}
function NumericPreview({ row, column }: { row: Row; column: SortKey }) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  const quotes = [...row.quotes].sort((a, b) =>
    a.availability === "available" && b.availability !== "available"
      ? -1
      : b.availability === "available" && a.availability !== "available"
        ? 1
        : (b.price.state === "value" ? b.price.value : -Infinity) -
          (a.price.state === "value" ? a.price.value : -Infinity),
  );
  const alternatives = [...row.alternatives].sort((a, b) =>
    column === "cost"
      ? a.cost - b.cost
      : column === "roi"
        ? a.roi === undefined
          ? 1
          : b.roi === undefined
            ? -1
            : b.roi - a.roi
        : b.profit - a.profit,
  );
  const headlineMarket =
    row.alternatives[0]?.quote.market ??
    quotes.find(
      (q) =>
        q.availability === "available" &&
        q.price.state === "value" &&
        row.sale.state === "value" &&
        q.price.value === row.sale.value,
    )?.market;
  return (
    <Box sx={{ maxWidth: 570, maxHeight: "40vh", overflow: "auto", p: 1 }}>
      <Typography fontWeight={700}>{row.item.label}</Typography>
      {row.route?.output && (
        <Typography variant="body2">
          {t("Crafting result")}: {t(tierLabel(row.route.output.tier))} ·{" "}
          {t("{count} gold stars", { count: row.route.quality })}
        </Typography>
      )}
      {row.cost.state === "value" && row.cost.lower !== undefined && (
        <Typography variant="body2">
          {t(
            "Cost range: {low}–{high} per item. Refunds vary; profit and ROI use the full upfront cost.",
            { low: row.cost.lower, high: row.cost.value },
          )}
        </Typography>
      )}
      {!!row.route?.output?.refundMax && (
        <Typography variant="body2">
          {t("Refunds: up to {count} ingredient units, chosen at random.", {
            count: row.route.output.refundMax,
          })}
        </Typography>
      )}
      {column !== "item" && row[column].state !== "value" && (
        <Typography variant="body2">
          {(row[column] as Exclude<Metric, { state: "value" }>).reason
            ? t((row[column] as Exclude<Metric, { state: "value" }>).reason)
            : ""}
        </Typography>
      )}
      {column === "sale" ? (
        <Table size="small" aria-label={t("Ranked sale markets")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("Market")}</TableCell>
              <TableCell align="right">{t("Sale price")}</TableCell>
              <TableCell>{t("Status")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotes.map((q) => (
              <TableRow key={q.market} selected={q.market === headlineMarket}>
                <TableCell>
                  <Box component="span" sx={{ display: "block" }}>
                    {q.market}
                  </Box>
                  {q.market === headlineMarket && (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        fontSize: "0.75rem",
                        lineHeight: 1.4,
                        color: "text.secondary",
                      }}
                    >
                      {t("Used in table")}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{metric(q.price)}</TableCell>
                <TableCell>{t(q.availability)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table size="small" aria-label={t("Ranked returns")}>
          <TableHead>
            <TableRow>
              <TableCell>{t("Sell at")}</TableCell>
              <TableCell align="right">{t("Cost")}</TableCell>
              <TableCell align="right">{t("Sale price")}</TableCell>
              <TableCell align="right">{t("Profit")}</TableCell>
              <TableCell align="right">{t("ROI")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {alternatives.map((a, i) => (
              <TableRow
                key={`${a.route.id}:${a.quote.market}:${i}`}
                selected={a === row.alternatives[0]}
              >
                <TableCell>
                  {a.quote.market}
                  <Typography variant="caption" display="block">
                    {t("Inputs for {quantity} output:", {
                      quantity: a.route.quantity,
                    })}
                  </Typography>
                  <Typography
                    variant="caption"
                    display="block"
                    sx={{ maxWidth: 230 }}
                  >
                    {a.route.steps
                      .filter((s) =>
                        ["inventory", "farm", "buy"].includes(s.kind),
                      )
                      .map(
                        (s) =>
                          `${t(s.kind)}: ${number(s.quantity)} × ${i18n.gameText(s.item)}${s.kind === "inventory" ? "" : ` (${i18n.stepLabel(s)})`}`,
                      )
                      .join("; ") || t(a.route.basis)}
                  </Typography>
                </TableCell>
                <TableCell align="right">{number(a.cost)}</TableCell>
                <TableCell align="right">{number(a.sale)}</TableCell>
                <TableCell align="right">{number(a.profit)}</TableCell>
                <TableCell align="right">
                  {a.roi === undefined ? "—" : i18n.p(a.roi)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!row.complete && (
        <Typography variant="caption">
          {t(
            "Comparison is incomplete; a cheapest route has not been confirmed.",
          )}
        </Typography>
      )}
      <Typography variant="caption" display="block" sx={{ mt: 1 }}>
        {t(
          "Per finished item. Click to pin. Zero-cost ROI: no spirit-stone investment.",
        )}
      </Typography>
    </Box>
  );
}
function Detail({
  row,
  world,
  prefs,
  column,
  native,
  onClose,
}: {
  row: Row;
  world: World;
  prefs: Preferences;
  column: SortKey;
  native?: NativeItemComponent;
  onClose: () => void;
}) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  const [desired, setDesired] = useState(1);
  const planned = useMemo(
    () => (desired === 1 ? row : evaluateRow(row.item, world, prefs, desired)),
    [row, world, prefs, desired],
  );
  return (
    <Paper
      component="aside"
      aria-label={t("Pinned item details")}
      variant="outlined"
      sx={{
        width: { xs: "100%", lg: column === "item" ? 380 : 560 },
        flexShrink: 0,
        p: 2,
        maxHeight: "72vh",
        overflow: "auto",
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h6">{row.item.label}</Typography>
        <Button size="small" onClick={onClose}>
          {t("Close")}
        </Button>
      </Stack>
      <TextField
        label={t("Desired output quantity")}
        type="number"
        size="small"
        value={desired}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isSafeInteger(n) && n >= 1 && n <= 100000) setDesired(n);
        }}
        inputProps={{ min: 1, max: 100000, step: 1 }}
        sx={{ my: 2 }}
        fullWidth
      />
      <Typography variant="body2">
        {t("Cost / item: {cost} · Profit / item: {profit}", {
          cost: metric(planned.cost),
          profit: metric(planned.profit),
        })}
      </Typography>
      {planned.route && (
        <Typography variant="body2">
          {t("Produces {quantity} · Spends {cost} spirit stones", {
            quantity: planned.route.quantity,
            cost: planned.route.cost,
          })}
        </Typography>
      )}
      <Divider sx={{ my: 1.5 }} />
      {column !== "item" && (
        <>
          <Typography fontWeight={700}>
            {t("{metric} alternatives", {
              metric: t(
                column === "cost"
                  ? "Cost"
                  : column === "sale"
                    ? "Sale price"
                    : column === "roi"
                      ? "ROI"
                      : "Profit",
              ),
            })}
          </Typography>
          <NumericPreview row={planned} column={column} />
          <Divider sx={{ my: 1.5 }} />
        </>
      )}
      <Typography fontWeight={700}>{t("Production plan")}</Typography>
      {planned.route?.steps.map((step, index) => (
        <Box key={index} sx={{ py: 0.75 }}>
          <Typography variant="body2">
            {number(step.quantity)} ×{" "}
            {world.items.get(step.item)?.label ?? step.item}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t(step.kind)} · {i18n.stepLabel(step)}
            {step.cost ? ` · ${t("{cost} stones", { cost: step.cost })}` : ""}
          </Typography>
        </Box>
      ))}
      {!planned.route && (
        <Typography variant="body2">{t(planned.reason ?? "")}</Typography>
      )}
      <Divider sx={{ my: 1.5 }} />
      <ItemPreview
        row={planned}
        world={world}
        tier={prefs.options.tier}
        native={native}
        showName={false}
      />
      {column === "item" && <NumericPreview row={planned} column="sale" />}
    </Paper>
  );
}

function LoadedPanel({
  api,
  screenAPI,
  data,
}: {
  api: GameAPI;
  screenAPI: ScreenAPI;
  data: ProfitData;
}) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  const { state, cache, world: allWorld, error, refreshing: updating } = data;
  const [prefs, setPrefs] = useState(() => readPreferences(state));
  const [mode, setMode] = useState(cache.mode);
  const world = useMemo(
    () => (allWorld ? selectMarkets(allWorld, prefs.marketIds) : null),
    [allWorld, JSON.stringify(prefs.marketIds)],
  );
  const calculationKey = JSON.stringify({
    filters: prefs.filters,
    options: prefs.options,
    reservations: prefs.reservations,
    markets: prefs.marketIds,
    language: i18n.version,
  });
  const [rows, setRows] = useState<Row[]>(
    () => cache.craft.get(calculationKey)?.rows ?? [],
  );
  const [rowWorld, setRowWorld] = useState<World | null>(
    () => cache.craft.get(calculationKey)?.world ?? world,
  );
  const [progress, setProgress] = useState(
      cache.craft.has(calculationKey) ? 1 : 0,
    ),
    [relevance, setRelevance] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [hover, setHover] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<SortKey>("item"),
    [page, setPage] = useState(0);
  useEffect(() => {
    const incoming = readPreferences(state);
    setPrefs((previous) =>
      JSON.stringify(previous) === JSON.stringify(incoming)
        ? previous
        : incoming,
    );
  }, [state]);
  const change = (next: Preferences) => {
    setPrefs(next);
    screenAPI.actions?.setModData?.(MOD_ID, "preferences", next);
  };
  const filters = (patch: Partial<Filters>) => {
    setPage(0);
    if (patch.search !== undefined) setRelevance(!!patch.search.trim());
    change({ ...prefs, filters: { ...prefs.filters, ...patch } });
  };
  const options = (patch: Partial<Options>) =>
    change({ ...prefs, options: { ...prefs.options, ...patch } });
  useEffect(() => {
    if (!world) return;
    let stopped = false,
      index = 0;
    const result: Row[] = [];
    const cached = cache.craft.get(calculationKey);
    if (cached) {
      setRows(cached.rows);
      setRowWorld(cached.world);
    }
    const hasCached = !!cached || rows.length > 0;
    let lastProgress = 0;
    setProgress(0);
    const items = visibleItems(world, prefs);
    const chunk = () => {
      if (stopped) return;
      const end = Math.min(index + 8, items.length);
      for (; index < end; index++)
        result.push(evaluateRow(items[index], world, prefs));
      if (
        index >= items.length ||
        (!hasCached && Date.now() - lastProgress > 150)
      ) {
        setProgress(items.length ? index / items.length : 1);
        lastProgress = Date.now();
      }
      if (index < items.length) timer = setTimeout(chunk, 0);
      else {
        cacheCraft(cache, calculationKey, result, world);
        setRows(result);
        setRowWorld(world);
      }
    };
    let timer = setTimeout(chunk, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [world, calculationKey, cache]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHover(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  const sorted = useMemo(() => {
    if (relevance && world && prefs.filters.search.trim())
      return [...rows].sort((a, b) => {
        const aa = matchScore(a.item, world, prefs.filters.search),
          bb = matchScore(b.item, world, prefs.filters.search);
        return (
          bb[0] - aa[0] ||
          bb[1] - aa[1] ||
          a.item.label.localeCompare(b.item.label, i18n.locale)
        );
      });
    return sortRows(rows, prefs.sort.key, prefs.sort.descending, i18n.locale);
  }, [rows, prefs.sort, prefs.filters.search, relevance, world, i18n.locale]);
  // Keep the pinned component mounted through table recalculation so its requested
  // quantity and scroll state survive reservation and calculator changes.
  const pinned = useMemo(
    () =>
      selected && world?.items.has(selected)
        ? evaluateRow(world.items.get(selected)!, world, prefs)
        : undefined,
    [selected, world, calculationKey],
  );
  const loading =
    !world || (mode === "crafting" && !rows.length && progress < 1);
  const displayPage = clampPage(page, sorted.length);
  const NativeItem = screenAPI.components?.ItemComponent as
    | React.ComponentType<{
        item: Raw;
        equipped: boolean;
        size: string;
        removeOverlays: boolean;
      }>
    | undefined;
  const headings: [SortKey, string][] = [
    ["item", t("Item")],
    ["cost", t("Cost")],
    ["sale", t("Sale price")],
    ["profit", t("Profit")],
    ["roi", t("ROI")],
  ];
  const status =
    (error ? t(error) : "") ||
    (!world
      ? t("Reading game data…")
      : loading
        ? t("Updating {percent}%", { percent: Math.round(progress * 100) })
        : mode === "arbitrage"
          ? t("{count} selected known markets", { count: world.markets.length })
          : t("{items} items · {recipes} recipes", {
              items: rows.length,
              recipes: world.recipes.length,
            }));
  return (
    <Box
      sx={{
        p: { xs: 1, md: 2 },
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        gap={1}
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {t("Profit Seeker")}
          </Typography>
          <Typography variant="body2" color="text.secondary" role="status">
            {status}
          </Typography>
        </Box>
      </Stack>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 1.5,
          width: "100%",
        }}
      >
        <Tabs
          value={mode}
          onChange={(_, value) => {
            setMode(value);
            cache.mode = value;
            setSelected(null);
            setHover(null);
          }}
          aria-label={t("Profit Seeker modes")}
          sx={{
            "& .MuiTab-root": { color: "#FFD700" },
            "& .Mui-selected": { color: "#FFD700 !important" },
            "& .MuiTabs-indicator": { bgcolor: "#FFD700" },
          }}
        >
          <Tab label={t("Crafting")} value="crafting" />
          <Tab label={t("Arbitrage")} value="arbitrage" />
        </Tabs>
        <MarketSelector
          world={allWorld}
          selected={prefs.marketIds}
          onChange={(marketIds) => {
            setPage(0);
            change({ ...prefs, marketIds });
          }}
        />
      </Box>
      {world && (
        <Box sx={{ display: mode === "arbitrage" ? "block" : "none" }}>
          <ArbitragePanel world={world} native={NativeItem} />
        </Box>
      )}
      {
        <Box sx={{ display: mode === "crafting" ? "block" : "none" }}>
          <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
              {t("Filter items")}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
              <TextField
                label={t("Search items, ingredients or places")}
                size="small"
                value={prefs.filters.search}
                onChange={(e) => filters({ search: e.target.value })}
                sx={{ flexGrow: 1, minWidth: 230 }}
              />
              <TextField
                select
                label={t("Realm")}
                size="small"
                value={prefs.filters.realm}
                onChange={(e) => filters({ realm: e.target.value })}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="all">{t("All realms")}</MenuItem>
                {REALMS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {i18n.realm(realmLabel(r))}
                  </MenuItem>
                ))}
              </TextField>
              <Check
                label={t("Known recipes only")}
                checked={prefs.filters.known}
                onChange={(known) => filters({ known })}
              />
              <Check
                label={t("Craftable items only")}
                checked={prefs.filters.craftable}
                onChange={(craftable) => filters({ craftable })}
              />
              <Check
                label={t("Can craft now only")}
                checked={prefs.filters.craftNow}
                onChange={(craftNow) => filters({ craftNow })}
              />
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
              {t("Calculate returns")}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
              <TextField
                select
                label={t("Crafting result")}
                size="small"
                value={prefs.options.tier}
                onChange={(e) =>
                  options({ tier: e.target.value as Options["tier"] })
                }
                sx={{ minWidth: 160 }}
              >
                <MenuItem value="basic">{t("Normal")}</MenuItem>
                <MenuItem value="perfect">{t("Perfect")}</MenuItem>
                <MenuItem value="sublime">{t("Sublime")}</MenuItem>
              </TextField>
              <TextField
                select
                label={t("Item stars")}
                size="small"
                value={
                  prefs.options.quality === "achieved" ? "achieved" : "custom"
                }
                onChange={(e) =>
                  options({
                    quality: e.target.value === "achieved" ? "achieved" : 0,
                  })
                }
                sx={{ minWidth: 185 }}
              >
                <MenuItem value="achieved">{t("Achieved gold stars")}</MenuItem>
                <MenuItem value="custom">{t("Plan gold stars")}</MenuItem>
              </TextField>
              {prefs.options.quality !== "achieved" && (
                <TextField
                  label={t("Planned gold stars")}
                  type="number"
                  size="small"
                  value={prefs.options.quality}
                  onChange={(e) => {
                    const count = Number(e.target.value);
                    if (Number.isSafeInteger(count) && count >= 0)
                      options({ quality: count });
                  }}
                  inputProps={{ min: 0, step: 1 }}
                  sx={{ width: 150 }}
                />
              )}
              <Check
                label={t("Buy ingredients")}
                checked={prefs.options.buy}
                onChange={(buy) => options({ buy })}
              />
              <Check
                label={t("Farm ingredients")}
                checked={prefs.options.farm}
                onChange={(farm) => options({ farm })}
              />
              <Check
                label={t("Use inventory ingredients")}
                checked={prefs.options.inventory}
                onChange={(inventory) => options({ inventory })}
              />
            </Stack>
          </Paper>
          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}
          {loading && (
            <LinearProgress
              aria-label={t("Updating calculations")}
              variant={world ? "determinate" : "indeterminate"}
              value={progress * 100}
              sx={{ mb: 1 }}
            />
          )}
          <Box
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "flex-start",
              flexDirection: { xs: "column", lg: "row" },
              minHeight: 0,
            }}
          >
            <Paper
              variant="outlined"
              sx={{ flex: 1, minWidth: 0, width: "100%" }}
            >
              <TableContainer sx={{ maxHeight: "62vh" }}>
                <Table
                  stickyHeader
                  size="small"
                  aria-label={t("Profit Seeker items")}
                >
                  <TableHead>
                    <TableRow>
                      {headings.map(([key, label]) => (
                        <TableCell
                          key={key}
                          align={key === "item" ? "left" : "right"}
                          sortDirection={
                            !relevance && prefs.sort.key === key
                              ? prefs.sort.descending
                                ? "desc"
                                : "asc"
                              : false
                          }
                        >
                          <TableSortLabel
                            active={!relevance && prefs.sort.key === key}
                            direction={prefs.sort.descending ? "desc" : "asc"}
                            onClick={() => {
                              setRelevance(false);
                              change({
                                ...prefs,
                                sort: {
                                  key,
                                  descending:
                                    prefs.sort.key === key
                                      ? !prefs.sort.descending
                                      : key !== "item",
                                },
                              });
                            }}
                          >
                            {label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sorted
                      .slice(displayPage * 40, displayPage * 40 + 40)
                      .map((row) => (
                        <TableRow
                          key={row.item.key}
                          hover
                          selected={selected === row.item.key}
                        >
                          <TableCell>
                            <Stack
                              direction="row"
                              alignItems="center"
                              gap={1.25}
                            >
                              <Tooltip
                                describeChild
                                open={hover === `${row.item.key}:item`}
                                onOpen={() => setHover(`${row.item.key}:item`)}
                                onClose={(event) => {
                                  if (!withinPreview(event, row.item.key))
                                    setHover((previous) =>
                                      previous === `${row.item.key}:item`
                                        ? null
                                        : previous,
                                    );
                                }}
                                enterDelay={250}
                                leaveDelay={200}
                                placement="right"
                                title={
                                  world ? (
                                    <ItemPreview
                                      row={row}
                                      world={rowWorld ?? world}
                                      tier={prefs.options.tier}
                                      native={NativeItem}
                                      onNestedOpen={() =>
                                        setHover(`${row.item.key}:item`)
                                      }
                                      onNestedClose={(event) => {
                                        if (!withinPreview(event, row.item.key))
                                          setHover((previous) =>
                                            previous === `${row.item.key}:item`
                                              ? null
                                              : previous,
                                          );
                                      }}
                                    />
                                  ) : (
                                    ""
                                  )
                                }
                                slotProps={{
                                  popper: {
                                    ...{ "data-preview-owner": row.item.key },
                                    modifiers: [
                                      {
                                        name: "preventOverflow",
                                        options: {
                                          altAxis: true,
                                          padding: 8,
                                          tether: false,
                                        },
                                      },
                                    ],
                                  },
                                  tooltip: {
                                    sx: {
                                      bgcolor: "background.paper",
                                      color: "text.primary",
                                      border: 1,
                                      borderColor: "divider",
                                      maxWidth: 560,
                                      p: 1,
                                    },
                                  },
                                }}
                              >
                                <ButtonBase
                                  aria-label={t(
                                    "Recipes and sources for {item}",
                                    { item: row.item.label },
                                  )}
                                  onClick={() => {
                                    setSelected(row.item.key);
                                    setSelectedMetric("item");
                                    setHover(null);
                                  }}
                                  sx={{ flexShrink: 0 }}
                                >
                                  {NativeItem ? (
                                    <NativeItem
                                      item={row.item.raw}
                                      equipped={false}
                                      size="38px"
                                      removeOverlays
                                    />
                                  ) : (
                                    <Box
                                      sx={{
                                        width: 38,
                                        height: 38,
                                        bgcolor: "action.hover",
                                        border: 1,
                                        borderColor: "divider",
                                        display: "grid",
                                        placeItems: "center",
                                      }}
                                    >
                                      {row.item.label.charAt(0)}
                                    </Box>
                                  )}
                                </ButtonBase>
                              </Tooltip>
                              <Box>
                                <Typography variant="body2" fontWeight={500}>
                                  {row.item.label}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {i18n.realm(realmLabel(row.item.realm))}
                                </Typography>
                              </Box>
                            </Stack>
                          </TableCell>
                          {headings.slice(1).map(([key]) => (
                            <TableCell
                              key={key}
                              align="right"
                              sx={{
                                fontVariantNumeric: "tabular-nums",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <Tooltip
                                describeChild
                                open={hover === `${row.item.key}:${key}`}
                                placement="auto"
                                onOpen={() =>
                                  setHover(`${row.item.key}:${key}`)
                                }
                                onClose={() =>
                                  setHover((previous) =>
                                    previous === `${row.item.key}:${key}`
                                      ? null
                                      : previous,
                                  )
                                }
                                enterDelay={250}
                                leaveDelay={200}
                                title={
                                  <NumericPreview row={row} column={key} />
                                }
                                slotProps={{
                                  popper: {
                                    modifiers: [
                                      {
                                        name: "preventOverflow",
                                        options: {
                                          altAxis: true,
                                          padding: 8,
                                          tether: false,
                                        },
                                      },
                                    ],
                                  },
                                  tooltip: {
                                    sx: {
                                      bgcolor: "background.paper",
                                      color: "text.primary",
                                      border: 1,
                                      borderColor: "divider",
                                      maxWidth: 620,
                                      p: 1,
                                    },
                                  },
                                }}
                              >
                                <ButtonBase
                                  onClick={() => {
                                    setSelected(row.item.key);
                                    setSelectedMetric(key);
                                    setHover(null);
                                  }}
                                  aria-label={t(
                                    "{metric} breakdown for {item}: {value}",
                                    {
                                      metric:
                                        headings.find(
                                          (h) => h[0] === key,
                                        )?.[1] ?? key,
                                      item: row.item.label,
                                      value: metric(
                                        row[key as Exclude<SortKey, "item">],
                                        key,
                                      ),
                                    },
                                  )}
                                  sx={{
                                    px: 0.5,
                                    py: 1,
                                    color:
                                      row[key as Exclude<SortKey, "item">]
                                        .state === "value"
                                        ? "text.primary"
                                        : "text.secondary",
                                  }}
                                >
                                  {metric(
                                    row[key as Exclude<SortKey, "item">],
                                    key,
                                  )}
                                </ButtonBase>
                              </Tooltip>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {!loading && !rows.length && (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <Typography sx={{ py: 4, textAlign: "center" }}>
                            {t(
                              "No items match these filters. Clear the search or broaden the realm and recipe filters.",
                            )}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                getItemAriaLabel={(type) =>
                  t(type === "next" ? "Go to next page" : "Go to previous page")
                }
                labelDisplayedRows={({ from, to, count }) =>
                  t("{from}–{to} of {count}", { from, to, count })
                }
                component="div"
                count={rows.length}
                page={displayPage}
                onPageChange={(_, next) => setPage(next)}
                rowsPerPage={40}
                rowsPerPageOptions={[40]}
              />
            </Paper>
            {pinned && world && (
              <Detail
                key={pinned.item.key}
                row={pinned}
                world={world}
                prefs={prefs}
                column={selectedMetric}
                native={NativeItem}
                onClose={() => setSelected(null)}
              />
            )}
          </Box>
        </Box>
      }
    </Box>
  );
}
export function ProfitSeekerPanel(props: {
  api: GameAPI;
  screenAPI: ScreenAPI;
  data?: ProfitData;
}) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  if (props.data)
    return (
      <LoadedPanel
        key={props.data.identity ?? "session"}
        {...props}
        data={props.data}
      />
    );
  return <ConnectedPanel api={props.api} screenAPI={props.screenAPI} />;
}
function ConnectedPanel({
  api,
  screenAPI,
}: {
  api: GameAPI;
  screenAPI: ScreenAPI;
}) {
  const i18n = useI18n(),
    { t } = i18n;
  const number = i18n.n;
  const metric = (m: Metric, k?: SortKey) => metricText(m, k, i18n);

  const data = useProfitWorld(api, screenAPI);
  if (!screenAPI.hasSave)
    return (
      <Alert severity="info">
        {t("Load a character to compare items and markets.")}
      </Alert>
    );
  return (
    <LoadedPanel
      key={data.identity ?? "session"}
      api={api}
      screenAPI={screenAPI}
      data={data}
    />
  );
}
