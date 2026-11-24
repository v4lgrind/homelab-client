import { ref } from "vue";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { STORAGE_KEYS, type ThemeMode } from "@/constants";

const stored = (localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || "auto";
const theme = ref<ThemeMode>(stored);

const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)");

/**
 * Android draws the status bar icons and colours them from the phone's theme,
 * not the app's: with the phone in light mode and the app forced dark, the
 * icons came out dark on black. Set them from the app's effective theme.
 */
function syncStatusBar(mode: ThemeMode) {
  if (!Capacitor.isNativePlatform()) return;
  const dark = mode === "dark" || (mode === "auto" && !!systemDark?.matches);
  // Style.Dark = light icons, for a dark background.
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

function apply(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  syncStatusBar(mode);
}

apply(theme.value);
// In auto, the app follows the phone through CSS; the icons must follow too.
systemDark?.addEventListener?.("change", () => {
  if (theme.value === "auto") syncStatusBar("auto");
});

/**
 * App-wide theme state. `auto` follows the OS via the CSS media query in
 * main.css; `light` / `dark` force a scheme through the [data-theme] attribute.
 */
export function useTheme() {
  function setTheme(mode: ThemeMode) {
    theme.value = mode;
    localStorage.setItem(STORAGE_KEYS.theme, mode);
    apply(mode);
  }

  function cycleTheme() {
    const order: ThemeMode[] = ["auto", "light", "dark"];
    const next = order[(order.indexOf(theme.value) + 1) % order.length];
    setTheme(next);
  }

  return { theme, setTheme, cycleTheme };
}
