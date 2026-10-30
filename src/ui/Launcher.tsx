import { useI18n, english, I18n } from "../i18n";
import React, { useEffect, useRef, useState } from "react";
import { Box, Dialog, DialogContent, IconButton, Tooltip } from "@mui/material";
import { GameAPI, ScreenAPI } from "../game/api";
import { ProfitSeekerPanel } from "./Panel";
import { obj } from "../domain/model";
import { MOD_ID } from "../state/preferences";
import { useProfitWorld } from "../state/runtime";
import { CaravanContext, useCaravan } from "../state/caravan";
import { CaravanOverlay } from "./Caravan";
import {
  Point,
  launcherFraction,
  launcherPixels,
  readLauncherPosition,
  saveLauncherPosition,
} from "../state/launcherPosition";

export function ProfitSeekerLauncher({
  api,
  screenAPI,
}: {
  api: GameAPI;
  screenAPI: ScreenAPI;
}) {
  const i18n = useI18n(),
    { t } = i18n;

  const [open, setOpen] = useState(false);
  const caravanState = screenAPI.useSelector((s) => obj(obj(obj(s.mod).data)[MOD_ID]).caravan);
  const autoUpdate =
    obj(caravanState).autoUpdate === true;
  const hasPlan = !!obj(caravanState).plan;
  const data = useProfitWorld(api, screenAPI, open || hasPlan);
  const caravan = useCaravan(api, screenAPI, data);
  const [position, setPosition] = useState<Point | null>(() => {
    try {
      return readLauncherPosition(window.localStorage);
    } catch {
      return null;
    }
  });
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    start: Point;
    origin: Point;
    previous: Point | null;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const resize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const pixels = launcherPixels(position, viewport.width, viewport.height);
  const persist = (p: Point) => {
    try {
      saveLauncherPosition(window.localStorage, p);
    } catch {
      /* Storage may be disabled. */
    }
  };
  const nextPosition = (x: number, y: number) => {
    const d = drag.current!;
    return launcherFraction(
      { x: d.origin.x + x - d.start.x, y: d.origin.y + y - d.start.y },
      window.innerWidth,
      window.innerHeight,
    );
  };
  if (!screenAPI.hasSave) return null;
  return (
    <CaravanContext.Provider value={caravan}>
      <CaravanOverlay
        controller={caravan}
        hidden={open}
        launcher={pixels}
        viewport={viewport}
      />
      <Tooltip
        title={t("Profit Seeker · Drag to move")}
        describeChild
        placement="left"
        disableHoverListener={dragging}
        disableFocusListener={dragging}
        disableTouchListener
      >
        <IconButton
          aria-label={t("Open Profit Seeker")}
          onPointerDown={(e) => {
            if (e.button !== 0 || drag.current) return;
            e.stopPropagation();
            suppressClick.current = false;
            drag.current = {
              id: e.pointerId,
              start: { x: e.clientX, y: e.clientY },
              origin: pixels,
              previous: position,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            e.stopPropagation();
            if (
              !d.moved &&
              Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 6
            )
              return;
            d.moved = true;
            suppressClick.current = true;
            setDragging(true);
            setPosition(nextPosition(e.clientX, e.clientY));
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            e.stopPropagation();
            if (d.moved) {
              const p = nextPosition(e.clientX, e.clientY);
              setPosition(p);
              persist(p);
            }
            drag.current = null;
            setDragging(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            if (drag.current) {
              setPosition(drag.current.previous);
              drag.current = null;
              setDragging(false);
              suppressClick.current = true;
            }
          }}
          onLostPointerCapture={() => {
            if (drag.current) {
              setPosition(drag.current.previous);
              drag.current = null;
              setDragging(false);
              suppressClick.current = true;
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (suppressClick.current && e.detail !== 0) {
              suppressClick.current = false;
              return;
            }
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (
              !e.altKey ||
              !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            )
              return;
            e.preventDefault();
            e.stopPropagation();
            const p = launcherFraction(
              {
                x:
                  pixels.x +
                  (e.key === "ArrowLeft"
                    ? -10
                    : e.key === "ArrowRight"
                      ? 10
                      : 0),
                y:
                  pixels.y +
                  (e.key === "ArrowUp" ? -10 : e.key === "ArrowDown" ? 10 : 0),
              },
              viewport.width,
              viewport.height,
            );
            setPosition(p);
            persist(p);
          }}
          sx={{
            position: "fixed",
            left: pixels.x,
            top: pixels.y,
            width: 48,
            height: 48,
            zIndex: (theme) => theme.zIndex.modal + 1,
            visibility: open ? "hidden" : "visible",
            color: "#FFD700",
            bgcolor: "#211b0f",
            touchAction: "none",
            userSelect: "none",
            cursor: dragging ? "grabbing" : "grab",
            border: 1,
            borderColor: "#FFD700",
            "&:hover": { bgcolor: "#342a12" },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "#FFD700",
              outlineOffset: 3,
            },
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v17M8 21h8M4 7h16M5 7l-3 7h6L5 7Zm14 0-3 7h6l-3-7ZM2 14a3 3 0 0 0 6 0m8 0a3 3 0 0 0 6 0" />
            <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="xl"
        aria-label={t("Profit Seeker")}
        PaperProps={{
          lang: i18n.locale,
          "aria-label": t("Profit Seeker"),
          sx: {
            height: "88vh",
            maxHeight: "calc(100vh - 32px)",
            m: 2,
            width: "calc(100% - 32px)",
          },
        }}
      >
        <Box
          sx={{ display: "flex", justifyContent: "flex-end", px: 1, pt: 0.5 }}
        >
          <IconButton
            aria-label={t("Close Profit Seeker")}
            onClick={() => setOpen(false)}
            size="small"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </IconButton>
        </Box>
        <DialogContent sx={{ p: 0 }}>
          <ProfitSeekerPanel api={api} screenAPI={screenAPI} data={data} />
        </DialogContent>
      </Dialog>
    </CaravanContext.Provider>
  );
}
