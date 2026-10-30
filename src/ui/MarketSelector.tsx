import { useI18n, english, I18n } from "../i18n";
import React, { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import { World } from "../domain/model";
import { knownMarkets } from "../query/markets";
export function MarketSelector({
  world,
  selected,
  onChange,
}: {
  world: World | null;
  selected?: string[];
  onChange: (ids: string[] | undefined) => void;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const markets = world ? knownMarkets(world) : [],
    ids = selected ?? markets.map((m) => m.id);
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        sx={{
          ml: "auto",
          flexShrink: 0,
          color: "#FFD700",
          borderColor: "#b89b42",
          px: 2,
          minHeight: 38,
          "&:hover": { borderColor: "#FFD700", bgcolor: "action.hover" },
        }}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {t("Markets ({selection})", {
          selection:
            selected === undefined
              ? t("All known")
              : `${i18n.n(markets.filter((m) => ids.includes(m.id)).length)}/${i18n.n(markets.length)}`,
        })}{" "}
        ▾
      </Button>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box
          role="dialog"
          aria-label={t("Select markets")}
          sx={{
            p: 2,
            width: 330,
            maxWidth: "90vw",
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
          <Typography fontWeight={700}>{t("Markets")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t(
              "Discovered locations and the current location. Applies to buying and selling in both tabs.",
            )}
          </Typography>
          <Stack direction="row">
            <Button onClick={() => onChange(undefined)}>
              {t("All known")}
            </Button>
            <Button onClick={() => onChange([])}>{t("None")}</Button>
            <Button onClick={() => setAnchor(null)}>{t("Done")}</Button>
          </Stack>
          {markets.map((m) => (
            <FormControlLabel
              key={m.id}
              sx={{ display: "flex" }}
              control={
                <Checkbox
                  size="small"
                  checked={ids.includes(m.id)}
                  onChange={(_, checked) =>
                    onChange(
                      checked
                        ? [...ids, m.id]
                        : ids.filter((id) => id !== m.id),
                    )
                  }
                />
              }
              label={`${m.name}${m.availability === "available" ? "" : ` · ${t(m.availability)}`}`}
            />
          ))}
          {!markets.length && (
            <Typography variant="body2">
              {t("No known markets found.")}
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
}
