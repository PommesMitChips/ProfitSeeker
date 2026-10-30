import { useI18n, english, I18n } from "../i18n";
import React, { useState } from "react";
import {
  Box,
  ButtonBase,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Item,
  Metric,
  Raw,
  Row,
  Tier,
  World,
  realmLabel,
} from "../domain/model";
import {
  acquisitionSources,
  instantYieldLabel,
  previewRecipe,
} from "../query/itemPreview";

export type NativeItemComponent = React.ComponentType<{
  item: Raw;
  equipped: boolean;
  size: string;
  removeOverlays: boolean;
}>;
export function withinPreview(
  event: React.SyntheticEvent | Event,
  owner: string,
): boolean {
  const related = "relatedTarget" in event ? event.relatedTarget : null;
  return (
    related instanceof Element &&
    related
      .closest("[data-preview-owner]")
      ?.getAttribute("data-preview-owner") === owner
  );
}
export function ItemArtwork({
  item,
  native,
  size = 28,
}: {
  item?: Item;
  native?: NativeItemComponent;
  size?: number;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  if (item && native)
    return React.createElement(native, {
      item: item.raw,
      equipped: false,
      size: `${size}px`,
      removeOverlays: true,
    });
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        bgcolor: "action.hover",
        border: 1,
        borderColor: "divider",
      }}
    >
      {item?.label.charAt(0) ?? "?"}
    </Box>
  );
}
const priceText = (cost: Metric | undefined, i18n: I18n): string =>
  !cost
    ? "—"
    : cost.state === "value"
      ? i18n.n(cost.value)
      : cost.state === "unavailable"
        ? i18n.t("Unavailable")
        : i18n.t("Unknown");

function IngredientPreview({
  name,
  world,
  owner,
}: {
  name: string;
  world: World;
  owner: string;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const item = world.items.get(name);
  const sources = (world.sources.get(name) ?? []).filter(
    (s) => s.kind !== "recipe",
  );
  return (
    <Box
      data-preview-owner={owner}
      sx={{ maxWidth: 440, maxHeight: "40vh", overflow: "auto", p: 0.5 }}
    >
      <Typography fontWeight={700}>{item?.label ?? name}</Typography>
      <Table
        size="small"
        aria-label={t("Sources and prices for {item}", {
          item: item?.label ?? name,
        })}
      >
        <TableHead>
          <TableRow>
            <TableCell>{t("Source")}</TableCell>
            <TableCell align="right">{t("Price")}</TableCell>
            <TableCell>{t("Status")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source.id}>
              <TableCell>
                {source.label === source.location
                  ? i18n.gameText(t(source.label))
                  : `${i18n.gameText(t(source.label))} · ${source.location}`}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                {priceText(source.cost, i18n)}
                {source.cost && source.currency
                  ? ` ${i18n.gameText(t(source.currency))}`
                  : ""}
              </TableCell>
              <TableCell>{t(source.availability)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!sources.length && (
        <Typography variant="body2">{t("Source not yet resolved.")}</Typography>
      )}
    </Box>
  );
}

export function ItemPreview({
  row,
  world,
  tier,
  native,
  onNestedOpen,
  onNestedClose,
  showName = true,
}: {
  row: Row;
  world: World;
  tier: Tier;
  native?: NativeItemComponent;
  onNestedOpen?: () => void;
  onNestedClose?: (event: React.SyntheticEvent | Event) => void;
  showName?: boolean;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const [chosen, setChosen] = useState<string>();
  const [ingredient, setIngredient] = useState<string | null>(null);
  const recipe = previewRecipe(row, world, tier, chosen);
  const recipes = world.recipesByOutput.get(row.item.name) ?? [];
  const acquisition = acquisitionSources(world, row.item, recipe);
  const owner = row.item.key;
  return (
    <Box
      data-preview-owner={owner}
      sx={{
        width: 330,
        maxWidth: "calc(100vw - 48px)",
        maxHeight: "60vh",
        overflow: "auto",
        p: 1,
      }}
    >
      {showName && (
        <>
          <Typography fontWeight={700}>{row.item.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {i18n.realm(realmLabel(row.item.realm))}
          </Typography>
        </>
      )}
      <Typography variant="body2" sx={{ mt: 1 }}>
        {instantYieldLabel(row.item, recipe, tier, world, i18n)}
      </Typography>
      <Typography variant="body2" fontWeight={700} sx={{ mt: 1.5, mb: 0.5 }}>
        {t("Recipe")}
      </Typography>
      {recipes.length > 1 && (
        <TextField
          select
          label={t("Recipe variant")}
          size="small"
          fullWidth
          value={recipe?.name ?? ""}
          onChange={(e) => setChosen(e.target.value)}
          slotProps={{
            select: {
              MenuProps: {
                slotProps: { paper: { ...{ "data-preview-owner": owner } } },
              },
            },
          }}
          sx={{ my: 0.5 }}
        >
          {recipes.map((r) => (
            <MenuItem key={r.name} value={r.name}>
              {i18n.gameText(r.name)}
            </MenuItem>
          ))}
        </TextField>
      )}
      {recipe ? (
        recipe.ingredients.map((entry, index) => {
          const key = `${entry.name}:${index}`,
            item = world.items.get(entry.name);
          return (
            <Tooltip
              key={key}
              describeChild
              placement="right-start"
              enterDelay={200}
              leaveDelay={150}
              open={ingredient === key}
              onOpen={() => {
                setIngredient(key);
                onNestedOpen?.();
              }}
              onClose={(event) => {
                setIngredient((current) => (current === key ? null : current));
                onNestedClose?.(event);
              }}
              title={
                <IngredientPreview
                  name={entry.name}
                  world={world}
                  owner={owner}
                />
              }
              slotProps={{
                popper: {
                  ...{ "data-preview-owner": owner },
                  sx: { zIndex: (theme) => theme.zIndex.tooltip + 1 },
                  modifiers: [
                    {
                      name: "preventOverflow",
                      options: { altAxis: true, padding: 8, tether: false },
                    },
                  ],
                },
                tooltip: {
                  sx: {
                    bgcolor: "background.paper",
                    color: "text.primary",
                    border: 1,
                    borderColor: "divider",
                    maxWidth: 480,
                    p: 1,
                  },
                },
              }}
            >
              <ButtonBase
                aria-label={t("Ingredient sources for {item}", {
                  item: item?.label ?? entry.name,
                })}
                onClick={() => {
                  setIngredient(key);
                  onNestedOpen?.();
                }}
                sx={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "flex-start",
                  py: 0.5,
                  gap: 1,
                  textAlign: "left",
                }}
              >
                <ItemArtwork item={item} native={native} />
                <Typography variant="body2">
                  {i18n.n(entry.quantity)} × {item?.label ?? entry.name}
                </Typography>
              </ButtonBase>
            </Tooltip>
          );
        })
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t("Not crafted.")}
        </Typography>
      )}
      <Typography variant="body2" fontWeight={700} sx={{ mt: 1.5, mb: 0.5 }}>
        {t("Acquisition")}
      </Typography>
      {acquisition.length ? (
        acquisition.map((source) => (
          <Typography key={source.id} variant="body2">
            {source.label === source.location || !source.location
              ? i18n.gameText(t(source.label))
              : `${i18n.gameText(t(source.label))} · ${source.location}`}
            {source.availability === "available"
              ? ""
              : ` · ${t(source.availability)}`}
          </Typography>
        ))
      ) : (
        <Typography variant="body2" color="text.secondary">
          {t(
            recipe
              ? "Recipe acquisition not yet resolved."
              : "Source not yet resolved.",
          )}
        </Typography>
      )}
    </Box>
  );
}
