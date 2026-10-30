import React from "react";
import { ProfitSeekerLauncher } from "./ui/Launcher";
import { TARGET_VERSION } from "./catalogue/readWorld";
import {GameI18nProvider} from './i18n/native';
const metadata = {
  name: "Profit Seeker",
  version: "0.3.0-alpha.8",
  author: { name: "PommesMitChips" },
  description: "Compare spirit-stone acquisition, crafting and market returns.",
  gameVersion: TARGET_VERSION,
};
const api = window.modAPI;
if (api?.injectUI && !window.__profitSeekerRegistered) {
  api.injectUI("player-ui", (screenAPI, insert) => {
    insert("", <GameI18nProvider api={api}><ProfitSeekerLauncher api={api} screenAPI={screenAPI} /></GameI18nProvider>);
  });
  window.__profitSeekerRegistered = true;
} else if (!api?.injectUI) {
  console.error(
    "[Profit Seeker] This game does not expose the UI injection API.",
  );
}
export default { getMetadata: () => metadata };
