import { useI18n, english, I18n } from "../i18n";
import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { CaravanController, useCaravanController } from "../state/caravan";
import { overlayPosition } from "../state/overlayPosition";
import { Point } from "../state/launcherPosition";
import { CaravanPlan } from "../planner/caravan";
import {
  bindCaravanOrders,
  caravanStops,
  CaravanStop,
  orderExpectedProfit,
} from "../planner/caravanProgress";

function CaravanProfits({ plan }: { plan: CaravanPlan }) {
  const { t } = useI18n();
  const orders = (plan.progress ? plan : bindCaravanOrders(plan)).progress!
    .orders;
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="body2">
        {t("Total expected profit: {amount}", {
          amount: orders.reduce((n, o) => n + orderExpectedProfit(o), 0),
        })}
      </Typography>
      <Typography variant="body2" fontWeight={700}>
        {t("Total gained profit: {amount}", {
          amount: orders.reduce((n, o) => n + o.gained, 0),
        })}
      </Typography>
      {orders.some((o) => o.uncertain) && (
        <Typography variant="caption" color="text.secondary">
          {t("Unconfirmed transactions are excluded from gained totals.")}
        </Typography>
      )}
    </Box>
  );
}

function StopOrders({ stop }: { stop: CaravanStop }) {
  const i18n = useI18n(),
    { t } = i18n;
  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }}>
      {stop.orders.map(({ action, quantity, order }) => (
        <Box
          component="li"
          key={`${action}:${order.id}`}
          sx={{
            py: 1,
            borderTop: 1,
            borderColor: "divider",
            overflowWrap: "anywhere",
          }}
        >
          <Typography variant="body2" fontWeight={700}>
            {t(
              action === "buy"
                ? "Buy {quantity} × {item}"
                : "Sell {quantity} × {item}",
              {
                quantity,
                item: i18n.gameText(order.trade.itemName ?? order.trade.item),
              },
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("{done}/{quantity} completed · {amount} stones", {
              done: Math.min(
                quantity,
                action === "buy" ? order.bought : order.sold,
              ),
              quantity,
              amount:
                quantity *
                (action === "buy" ? order.trade.cost : order.trade.sale),
            })}
          </Typography>
          <Box
            sx={{
              display: "flex",
              columnGap: 2,
              flexWrap: "wrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Typography variant="body2">
              {t("Expected profit: {amount}", {
                amount: orderExpectedProfit(order),
              })}
            </Typography>
            <Typography variant="body2">
              {t("Gained profit: {amount}", {
                amount: i18n.n(order.gained),
              })}
            </Typography>
          </Box>
          {order.uncertain && (
            <Typography variant="caption" color="text.secondary">
              {t("Unconfirmed transactions are excluded from gained totals.")}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
export function caravanDirections(
  plan: CaravanPlan,
  i18n: I18n = english,
): string[] {
  const groups: CaravanPlan["trades"][] = [];
  for (const trade of plan.trades) {
    const last = groups.at(-1);
    if (last && trade.group && last[0].group === trade.group) last.push(trade);
    else groups.push([trade]);
  }
  return groups.flatMap((group) => {
    const first = group[0],
      buy = group.find((trade) => trade.buyAt),
      lines: string[] = [];
    if (buy && first.toBuyDays)
      lines.push(
        i18n.t("Travel to {market} · {days} days", {
          market: i18n.location(buy.buyId ?? buy.buyAt!, buy.buyAt),
          days: first.toBuyDays,
        }),
      );
    for (const trade of group)
      if (trade.buyAt)
        lines.push(
          i18n.t("Buy {quantity} × {item} at {market} · {cost} stones", {
            quantity: trade.quantity,
            item: i18n.gameText(
              trade.itemName ??
                plan.tracked.find((i) => i.key === trade.key)?.name ??
                trade.item,
            ),
            market: i18n.location(trade.buyId ?? trade.buyAt, trade.buyAt),
            cost: trade.cost * trade.quantity,
          }),
        );
    if (first.toSellDays)
      lines.push(
        i18n.t("Travel to {market} · {days} days", {
          market: i18n.location(first.sellId, first.sellAt),
          days: first.toSellDays,
        }),
      );
    for (const trade of group)
      lines.push(
        i18n.t("Sell {quantity} × {item} at {market} · {amount} stones", {
          quantity: trade.quantity,
          item: i18n.gameText(
            trade.itemName ??
              plan.tracked.find((i) => i.key === trade.key)?.name ??
              trade.item,
          ),
          market: i18n.location(trade.sellId, trade.sellAt),
          amount: trade.sale * trade.quantity,
        }),
      );
    return lines;
  });
}
export function CaravanPanel() {
  const i18n = useI18n(),
    { t } = i18n;

  const ctrl = useCaravanController();
  if (!ctrl) return null;
  const { settings, save, generate, busy, ready, error, cash } = ctrl,
    plan = settings.plan;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap">
        <Button
          variant="outlined"
          sx={{ color: "#FFD700", borderColor: "#b89b42" }}
          disabled={!ready || busy}
          onClick={generate}
        >
          {busy
            ? t("Planning…")
            : plan
              ? t("Refresh caravan")
              : t("Plan Caravan")}
        </Button>
        <Typography variant="body2">
          {t("Spirit stones: {amount}", {
            amount: typeof cash === "number" ? i18n.n(cash) : t("Unknown"),
          })}
        </Typography>
        <TextField
          label={t("Max trades")}
          type="number"
          size="small"
          value={settings.maxTrades}
          inputProps={{ min: 1, max: 20 }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 1 && v <= 20)
              save({ maxTrades: v });
          }}
          sx={{ width: 110 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={settings.autoUpdate}
              onChange={(_, autoUpdate) => save({ autoUpdate })}
            />
          }
          label={t("Auto-update plan")}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={settings.overlay}
              onChange={(_, overlay) => save({ overlay })}
            />
          }
          label={t("Show caravan overlay")}
        />
      </Stack>
      {error && <Typography color="error">{t(error)}</Typography>}
      {plan && (
        <>
          <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 1 }}>
            <Typography fontWeight={700}>{t("Best plan found")}</Typography>
            <Typography>
              {t("Trade profit: {amount}", { amount: plan.gain })}
            </Typography>
            <Typography>
              {t("Travel: {days} days", { days: plan.days })}
            </Typography>
            <Typography>
              {plan.days
                ? t("{amount} stones/day", { amount: plan.gainPerDay ?? 0 })
                : plan.gain > 0
                  ? t("No travel needed")
                  : "—"}
            </Typography>
            <Typography>
              {t("Ending balance: {amount}", { amount: plan.endCash })}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {t(
              "Bounded search, up to {count} trades. Current stock and prices; future restocks and travel events are not predicted. Carried purchases retain their planned acquisition cost when updating.",
              { count: settings.maxTrades },
            )}
          </Typography>
          <CaravanProfits plan={plan} />
          {plan.reason && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t(plan.reason ?? "")}
            </Typography>
          )}
          <Box component="ol" sx={{ pl: 3, maxHeight: 260, overflow: "auto" }}>
            {caravanDirections(plan, i18n).map((line, i) => (
              <Typography
                component="li"
                variant="body2"
                key={i}
                sx={{ py: 0.35 }}
              >
                {line}
              </Typography>
            ))}
          </Box>
          <Button
            size="small"
            onClick={() => save({ plan: undefined, cursor: 0 })}
          >
            {t("Clear plan")}
          </Button>
        </>
      )}
    </Paper>
  );
}
export function CaravanOverlay({
  controller,
  hidden,
  launcher,
  viewport,
}: {
  controller: CaravanController;
  hidden: boolean;
  launcher: Point;
  viewport: { width: number; height: number };
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const [collapsed, setCollapsed] = useState(false),
    { settings, save } = controller;
  const plan = settings.plan;
  const paper = useRef<HTMLDivElement | null>(null),
    [height, setHeight] = useState(180);
  useLayoutEffect(() => {
    const el = paper.current;
    if (!el) return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hidden, settings.overlay, collapsed, plan]);
  const position = overlayPosition(launcher, viewport, height);
  if (hidden || !settings.overlay || !plan) return null;
  const stops = caravanStops(plan),
    cursor = Math.min(settings.cursor, Math.max(0, stops.length - 1)),
    stop = stops[cursor];
  return (
    <Paper
      ref={paper}
      role="region"
      aria-label={t("Caravan guide")}
      variant="outlined"
      sx={{
        position: "fixed",
        left: position.x,
        top: position.y,
        boxSizing: "border-box",
        maxHeight: "calc(100vh - 32px)",
        overflow: "auto",
        width: 360,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 1200,
        p: 1.25,
        opacity: 0.94,
        pointerEvents: "auto",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={700} color="#FFD700">
          {t("Caravan")}
          {stops.length ? ` ${i18n.n(cursor + 1)}/${i18n.n(stops.length)}` : ""}
        </Typography>
        <Stack direction="row">
          <Button
            size="small"
            color="inherit"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t("Expand caravan") : t("Collapse caravan")}
          >
            {collapsed ? "+" : "−"}
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => save({ overlay: false })}
          >
            {t("Hide")}
          </Button>
        </Stack>
      </Stack>
      {!collapsed && (
        <>
          <CaravanProfits plan={plan} />
          {stop ? (
            <>
              <Typography variant="subtitle2">
                {i18n.location(stop.location, stop.label)}
              </Typography>
              {stop.days > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {t("Travel: {days} days", { days: stop.days })}
                </Typography>
              )}
              <StopOrders stop={stop} />
            </>
          ) : (
            <Typography variant="body2">
              {t(plan.reason ?? "No trades planned.")}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            {settings.autoUpdate ? t("Auto-update on") : t("Manual plan")} ·{" "}
            {plan.days
              ? t("{amount} stones/day", { amount: plan.gainPerDay ?? 0 })
              : t("No travel")}
          </Typography>
          <Stack direction="row" justifyContent="space-between">
            <Button
              color="inherit"
              size="small"
              disabled={!cursor}
              onClick={() => save({ cursor: cursor - 1 })}
            >
              {t("Previous location")}
            </Button>
            <Button
              color="inherit"
              size="small"
              disabled={cursor >= stops.length - 1}
              onClick={() => save({ cursor: cursor + 1 })}
            >
              {t("Next location")}
            </Button>
          </Stack>
        </>
      )}
    </Paper>
  );
}
