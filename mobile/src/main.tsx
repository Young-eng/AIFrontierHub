import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import App from "./App";
import { installApiBridge } from "./apiBridge";
import { installNativeBack } from "./nativeBack";
import { hydrateSecrets, installSecretStore } from "../../src/lib/secrets";
import "../../src/app/globals.css";
import "./mobile.css";

const g = globalThis as typeof globalThis & { process?: { cwd: () => string; env: Record<string, string | undefined> } };
g.process ??= { cwd: () => "/app", env: {} };
g.process.cwd ??= () => "/app";
g.process.env ??= {};

const API_KEY = "DEEPSEEK_API_KEY";

installApiBridge();
installNativeBack();

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add("is-native");
  // Prefer native Preferences over WebView localStorage (survives less casually via backup).
  installSecretStore({
    async get() {
      const { value } = await Preferences.get({ key: API_KEY });
      if (value?.trim()) return value.trim();
      try {
        const legacy = window.localStorage.getItem(API_KEY)?.trim() || "";
        if (legacy) {
          await Preferences.set({ key: API_KEY, value: legacy });
          window.localStorage.removeItem(API_KEY);
          window.localStorage.removeItem("TRANSLATE_API_KEY");
        }
        return legacy;
      } catch {
        return "";
      }
    },
    async set(value: string) {
      const next = value.trim();
      if (next) await Preferences.set({ key: API_KEY, value: next });
      else await Preferences.remove({ key: API_KEY });
      try {
        window.localStorage.removeItem(API_KEY);
        window.localStorage.removeItem("TRANSLATE_API_KEY");
      } catch {
        /* ignore */
      }
    },
  });
}

void hydrateSecrets().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {/* HashRouter avoids Capacitor path mismatches with BrowserRouter. */}
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>,
  );
});
