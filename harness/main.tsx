import React, { useState, useSyncExternalStore } from "react";
import { I18nProvider, languageOptions } from "../src/i18n";
import { createRoot } from "react-dom/client";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  Alert,
  Button,
} from "@mui/material";
import { ProfitSeekerPanel } from "../src/ui/Panel";
import { ProfitSeekerLauncher } from "../src/ui/Launcher";
import { ScreenAPI } from "../src/game/api";
import { createFixture } from "./fixture";
import { Raw } from "../src/domain/model";
// Illustrative stand-in for the game's ItemComponent; never bundled in the mod.
function FixtureIcon({ item, size }: { item: Raw; size: string }) {
  const herb = item.name === "Moonleaf";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="3"
        fill="#303b3b"
        stroke="#687d71"
      />
      {herb ? (
        <>
          <path d="M9 23C4 11 18 5 26 6C27 19 17 25 9 23Z" fill="#88b87a" />
          <path d="M7 26L23 9" stroke="#cbe4b2" />
        </>
      ) : (
        <path d="M16 5L25 12L21 25H11L7 12Z" fill="#b4ceb5" stroke="#e6dbc2" />
      )}
    </svg>
  );
}
const fixture = createFixture();
function FixtureLanguage() {
  const [language, setLanguage] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("GameLanguage") ?? '"en"');
    } catch {
      return "en";
    }
  });
  return (
    <label>
      Fixture game language{" "}
      <select
        aria-label="Fixture game language"
        value={language}
        onChange={(e) => {
          setLanguage(e.target.value);
          localStorage.setItem("GameLanguage", JSON.stringify(e.target.value));
          window.dispatchEvent(new Event("storage"));
        }}
      >
        {languageOptions.map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
const screenAPI: ScreenAPI = {
  hasSave: true,
  useSelector: (selector) =>
    selector(useSyncExternalStore(fixture.api.subscribe, fixture.getState)),
  useGameFlags: () => ({
    flags: fixture.flags,
    flagsJSON: JSON.stringify(fixture.flags),
  }),
  actions: { setModData: fixture.setModData },
  components: { ItemComponent: FixtureIcon },
};
const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#ead16a" },
    background: { default: "#181a21", paper: "#22242e" },
  },
  typography: { fontFamily: "Arial, sans-serif", fontSize: 14 },
  shape: { borderRadius: 5 },
});
createRoot(document.getElementById("root")!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <I18nProvider api={fixture.api}>
      <Box sx={{ maxWidth: 1520, mx: "auto", p: 1 }}>
        <Alert
          severity="info"
          action={
            <>
              <Button
                color="inherit"
                size="small"
                onClick={fixture.simulatePurchase}
              >
                Simulate purchase
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={fixture.simulateSale}
              >
                Simulate sale
              </Button>
              <Button
                color="inherit"
                size="small"
                onClick={fixture.switchCharacter}
              >
                Switch character
              </Button>
            </>
          }
        >
          Development fixtures — illustrative items and markets, not a live game
          save.
        </Alert>
        <FixtureLanguage />
        <ProfitSeekerPanel api={fixture.api} screenAPI={screenAPI} />
        <ProfitSeekerLauncher api={fixture.api} screenAPI={screenAPI} />
      </Box>
    </I18nProvider>
  </ThemeProvider>,
);
