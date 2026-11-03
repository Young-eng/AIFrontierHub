import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { consumeBack } from "../../src/hooks/useReaderBack";

/** Hardware / gesture back: close reader first, then history, else exit. */
export function installNativeBack(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener("backButton", ({ canGoBack }) => {
    if (consumeBack()) return;
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }
    void App.exitApp();
  });
}
