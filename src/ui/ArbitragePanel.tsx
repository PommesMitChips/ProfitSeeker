import { useI18n, english, I18n } from "../i18n";
import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  FormControlLabel,
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
  Metric,
  SortKey,
  World,
  REALMS,
  realmLabel,
  num,
  obj,
} from "../domain/model";
import { cachedArbitrageRows, ArbitrageRow } from "../planner/arbitrage";
import { CaravanPanel } from "./Caravan";
import { clampPage, matchScore, sortRows } from "../query/query";
import { ItemArtwork, NativeItemComponent } from "./ItemPreview";
const fmt = (m: Metric, key?: SortKey, i18n: I18n = english) =>
  m.state === "value"
    ? key === "roi"
      ? i18n.p(m.value)
      : i18n.n(m.value)
    : m.state === "undefined"
      ? "—"
      : m.state === "unknown"
        ? i18n.t("Unknown")
        : i18n.t("Unavailable");
function Routes({ row }: { row: ArbitrageRow }) {
  const i18n = useI18n(),
    { t } = i18n;

  return (
    <Box sx={{ p: 1, maxWidth: 720, maxHeight: "55vh", overflow: "auto" }}>
      <Typography fontWeight={700}>{row.item.label}</Typography>
      <Typography variant="body2">
        {t("Buy and resell the same item · per item")}
      </Typography>
      <Table size="small" aria-label={t("Ranked arbitrage routes")}>
        <TableHead>
          <TableRow>
            {[
              t("Buy at"),
              t("Sell at"),
              t("Stock"),
              t("Buy price"),
              t("Sale"),
              t("Profit"),
              t("ROI"),
            ].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {row.alternatives.map((a, i) => (
            <TableRow
              key={`${a.route.id}:${a.quote.marketId ?? a.quote.market}`}
              selected={i === 0}
            >
              <TableCell>
                <Box component="span" sx={{ display: "block" }}>
                  {a.route.steps[0].label}
                </Box>
                {i === 0 && (
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
              <TableCell>{a.quote.market}</TableCell>
              <TableCell>
                {row.offers.find((s) => s.id === a.route.id)?.quantity}
              </TableCell>
              {[a.cost, a.sale, a.profit].map((n, j) => (
                <TableCell key={j}>{i18n.n(n)}</TableCell>
              ))}
              <TableCell>{a.roi === undefined ? "—" : i18n.p(a.roi)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!row.alternatives.length && (
        <Typography variant="body2">
          {t("No confirmed in-stock route.")}
        </Typography>
      )}
      {row.offers
        .filter((s) => s.availability !== "available")
        .map((s) => (
          <Typography key={s.id} variant="body2">
            {s.location}: {t(s.availability)} · {t(s.reason ?? "")}
          </Typography>
        ))}
    </Box>
  );
}
export function ArbitragePanel({
  world,
  native,
}: {
  world: World;
  native?: NativeItemComponent;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const [search, setSearch] = useState(""),
    [realm, setRealm] = useState("all"),
    [positive, setPositive] = useState(false),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
      key: "profit",
      desc: true,
    });
  const rows = useMemo(() => cachedArbitrageRows(world), [world]);
  const filtered = rows.filter(
    (r) =>
      (realm === "all" || r.item.realm === realm) &&
      (!search.trim() || matchScore(r.item, world, search)[0] > 0) &&
      (!positive || (r.profit.state === "value" && r.profit.value > 0)),
  );
  const sorted = sortRows(
      filtered,
      sort.key,
      sort.desc,
      i18n.locale,
    ) as ArbitrageRow[],
    displayPage = clampPage(page, sorted.length),
    pinned = rows.find((r) => r.item.key === selected);
  const headings: [SortKey, string][] = [
    ["item", t("Item")],
    ["cost", t("Buy price")],
    ["sale", t("Sale price")],
    ["profit", t("Profit")],
    ["roi", t("ROI")],
  ];
  return (
    <Box
      role="tabpanel"
      id="profit-seeker-arbitrage"
      aria-label={t("Arbitrage")}
    >
      <CaravanPanel />
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          <TextField
            label={t("Search arbitrage items or places")}
            size="small"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            sx={{ flex: 1, minWidth: 220 }}
          />
          <TextField
            select
            label={t("Realm")}
            size="small"
            value={realm}
            onChange={(e) => {
              setRealm(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="all">{t("All realms")}</MenuItem>
            {REALMS.map((r) => (
              <MenuItem key={r} value={r}>
                {i18n.realm(realmLabel(r))}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={positive}
                onChange={(_, v) => {
                  setPositive(v);
                  setPage(0);
                }}
              />
            }
            label={t("Profitable only")}
          />
        </Stack>
      </Paper>
      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: "62vh" }}>
          <Table stickyHeader size="small" aria-label={t("Arbitrage items")}>
            <TableHead>
              <TableRow>
                {headings.map(([key, label]) => (
                  <TableCell
                    key={key}
                    align={key === "item" ? "left" : "right"}
                  >
                    <TableSortLabel
                      active={sort.key === key}
                      direction={sort.desc ? "desc" : "asc"}
                      onClick={() =>
                        setSort({
                          key,
                          desc: sort.key === key ? !sort.desc : key !== "item",
                        })
                      }
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
                  <TableRow key={row.item.key} hover>
                    {headings.map(([key]) => (
                      <TableCell
                        key={key}
                        align={key === "item" ? "left" : "right"}
                      >
                        <Tooltip
                          describeChild
                          title={<Routes row={row} />}
                          slotProps={{
                            tooltip: {
                              sx: {
                                maxWidth: 760,
                                bgcolor: "background.paper",
                                color: "text.primary",
                                border: 1,
                                borderColor: "divider",
                              },
                            },
                          }}
                        >
                          <ButtonBase
                            aria-label={t(
                              "Arbitrage {metric} details for {item}",
                              {
                                metric:
                                  headings.find((h) => h[0] === key)?.[1] ??
                                  key,
                                item: row.item.label,
                              },
                            )}
                            onClick={() => setSelected(row.item.key)}
                            sx={{
                              textAlign: "left",
                              py: 1,
                              width: "100%",
                              justifyContent:
                                key === "item" ? "flex-start" : "flex-end",
                              gap: 1,
                            }}
                          >
                            {key === "item" ? (
                              <>
                                <ItemArtwork
                                  item={row.item}
                                  native={native}
                                  size={38}
                                />
                                <Box>
                                  <Typography variant="body2">
                                    {row.item.label}
                                  </Typography>
                                  <Typography variant="caption">
                                    {i18n.realm(realmLabel(row.item.realm))}
                                    {num(
                                      obj(row.item.raw.harmonyAugment).quality,
                                    ) > 0
                                      ? ` · ${t("{count} gold stars", { count: num(obj(row.item.raw.harmonyAugment).quality) })}`
                                      : ""}
                                    {row.item.raw.enchantment
                                      ? ` · ${t("Enchanted")}`
                                      : ""}
                                  </Typography>
                                </Box>
                              </>
                            ) : (
                              fmt(row[key], key, i18n)
                            )}
                          </ButtonBase>
                        </Tooltip>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!sorted.length && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography sx={{ py: 3, textAlign: "center" }}>
                      {t("No items match the selected markets and filters.")}
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
          count={sorted.length}
          page={displayPage}
          rowsPerPage={40}
          rowsPerPageOptions={[40]}
          onPageChange={(_, p) => setPage(p)}
        />
      </Paper>
      {pinned && (
        <Paper variant="outlined" sx={{ mt: 1.5, p: 1 }}>
          <Button onClick={() => setSelected(null)}>
            {t("Close route details")}
          </Button>
          <Routes row={pinned} />
        </Paper>
      )}
    </Box>
  );
}
