import React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Alternative, Metric, Row, SortKey } from "../domain/model";
import { purchaseMetric, stocked } from "../query/marketCatalogue";
import { useI18n } from "../i18n";

/** Stock is the market's offer list; selling an owned item is a separate quote. */
export function MarketDetails({
  row,
  buyOnly = false,
}: {
  row: Row;
  buyOnly?: boolean;
}) {
  const i18n = useI18n(),
    { t, n } = i18n;
  const format = (metric: Metric) =>
    metric.state === "value" ? n(metric.value) : "—";
  const purchases = row.purchases ?? [];
  const quotes = row.quotes
    .filter((q) => !buyOnly || purchases.some((s) => s.marketId === q.marketId))
    .sort((a, b) => {
      if (buyOnly) {
        const ap = purchaseMetric(
            purchases.filter((s) => s.marketId === a.marketId),
          ),
          bp = purchaseMetric(
            purchases.filter((s) => s.marketId === b.marketId),
          );
        return (
          (ap.state === "value" ? ap.value : Infinity) -
          (bp.state === "value" ? bp.value : Infinity)
        );
      }
      return (
        (b.price.state === "value" ? b.price.value : -Infinity) -
        (a.price.state === "value" ? a.price.value : -Infinity)
      );
    });
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ mb: 1 }}>
        {t(
          buyOnly
            ? "Markets that sell this item"
            : "Markets that buy this item",
        )}
      </Typography>
      <Typography
        component="div"
        variant="caption"
        sx={{ display: "block", mb: 1.5, lineHeight: 1.6 }}
      >
        {t("Purchase listings only. Sale quotes do not imply stock.")}
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Table
          size="small"
          aria-label={t(
            buyOnly ? "Markets that sell this item" : "Ranked sale markets",
          )}
          sx={{
            minWidth: 440,
            "& td, & th": { py: 1.25, px: 1, verticalAlign: "top" },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>{t("Market")}</TableCell>
              <TableCell align="right">{t("Buy price")}</TableCell>
              <TableCell align="right">{t("Stock")}</TableCell>
              <TableCell align="right">{t("Sale price")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {quotes.map((q) => {
              const listings = purchases.filter(
                  (s) => s.marketId === q.marketId,
                ),
                price = purchaseMetric(listings);
              const atPrice = listings.filter(
                (s) =>
                  stocked(s) &&
                  s.cost?.state === "value" &&
                  price.state === "value" &&
                  s.cost.value === price.value,
              );
              const quantity = (
                price.state === "value" ? atPrice : listings
              ).reduce((total, s) => total + (s.quantity ?? 0), 0);
              const isHeadline = buyOnly
                ? price.state === "value" &&
                  row.buy.state === "value" &&
                  price.value === row.buy.value
                : q.marketId ===
                  (row.alternatives[0]?.quote.marketId ??
                    quotes.find(
                      (candidate) =>
                        candidate.availability === "available" &&
                        candidate.price.state === "value" &&
                        row.sale.state === "value" &&
                        candidate.price.value === row.sale.value,
                    )?.marketId);
              return (
                <TableRow key={q.marketId ?? q.market} selected={isHeadline}>
                  <TableCell sx={{ minWidth: 150 }}>
                    <Box>{q.market}</Box>
                    {isHeadline && (
                      <Typography
                        component="div"
                        variant="caption"
                        sx={{ display: "block", mt: 0.5, lineHeight: 1.5 }}
                      >
                        {t("Used in table")}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {format(price)}
                    {price.state !== "value" && (
                      <Typography
                        component="div"
                        variant="caption"
                        sx={{ display: "block", mt: 0.5, lineHeight: 1.5 }}
                      >
                        {t(
                          !listings.length
                            ? "Not stocked"
                            : price.state === "unknown" ||
                                listings.some(
                                  (s) => s.availability === "unknown",
                                )
                              ? "Unknown"
                              : listings.some(
                                    (s) => s.availability === "locked",
                                  )
                                ? "locked"
                                : "Out of stock.",
                        )}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {!listings.length
                      ? "—"
                      : listings.every((s) => s.quantity === undefined)
                        ? t("Unknown")
                        : n(quantity)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {q.availability === "available"
                      ? format(q.price)
                      : t(q.availability)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      {!quotes.length && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {t("No confirmed purchase stock for this item.")}
        </Typography>
      )}
    </Box>
  );
}

export function groupedReturns(alternatives: Alternative[]): Alternative[][] {
  const groups = new Map<string, Map<string, Alternative>>();
  for (const a of alternatives) {
    const signature = JSON.stringify([
      a.route.quantity,
      a.route.quality,
      a.route.steps.map((s) => [s.kind, s.item, s.quantity, s.label, s.cost]),
    ]);
    const group = groups.get(signature) ?? new Map();
    const market = a.quote.marketId ?? a.quote.market;
    if (!group.has(market)) group.set(market, a);
    groups.set(signature, group);
  }
  return [...groups.values()].map((g) => [...g.values()]);
}
export function ReturnDetails({ row, column }: { row: Row; column: SortKey }) {
  const i18n = useI18n(),
    { t, n } = i18n;
  const ordered = [...row.alternatives].sort((a, b) =>
    column === "cost"
      ? a.cost - b.cost
      : column === "roi"
        ? (b.roi ?? -Infinity) - (a.roi ?? -Infinity)
        : b.profit - a.profit,
  );
  return (
    <Box>
      {groupedReturns(ordered).map((group, index) => {
        const route = group[0].route;
        return (
          <Box
            key={index}
            sx={{
              mt: 2,
              pt: index ? 1.5 : 0,
              borderTop: index ? 1 : 0,
              borderColor: "divider",
            }}
          >
            <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
              {t("Inputs for {quantity} output:", { quantity: route.quantity })}
            </Typography>
            <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5 }}>
              {route.steps
                .filter((s) => ["inventory", "farm", "buy"].includes(s.kind))
                .map((step, i) => (
                  <Box component="li" key={i} sx={{ mb: 1 }}>
                    <Typography
                      component="div"
                      variant="body2"
                      sx={{ display: "block", lineHeight: 1.6 }}
                    >
                      {n(step.quantity)} × {i18n.gameText(step.item)}
                    </Typography>
                    <Typography
                      component="div"
                      variant="body2"
                      sx={{ display: "block", lineHeight: 1.6 }}
                    >
                      {t(step.kind === "buy" ? "Buy at" : step.kind)}:{" "}
                      {i18n.stepLabel(step)}
                      {step.kind === "buy"
                        ? ` · ${n(step.quantity)} × ${n(step.cost / step.quantity)} = ${t("{cost} stones", { cost: step.cost })}`
                        : ""}
                    </Typography>
                  </Box>
                ))}
            </Box>
            <Box sx={{ overflowX: "auto" }}>
              <Table
                size="small"
                aria-label={t("Ranked returns")}
                sx={{
                  minWidth: 440,
                  "& td, & th": { py: 1.25, px: 1, verticalAlign: "top" },
                }}
              >
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
                  {group.map((a) => (
                    <TableRow
                      key={a.quote.marketId ?? a.quote.market}
                      selected={a === row.alternatives[0]}
                    >
                      <TableCell sx={{ minWidth: 140 }}>
                        {a.quote.market}
                      </TableCell>
                      <TableCell align="right">{n(a.cost)}</TableCell>
                      <TableCell align="right">{n(a.sale)}</TableCell>
                      <TableCell align="right">{n(a.profit)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {a.roi === undefined ? "—" : i18n.p(a.roi)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
