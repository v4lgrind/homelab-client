import { ref } from "vue";
import { STORAGE_KEYS, type ThemeMode } from "@/constants";

const stored = (localStorage.getItem(STORAGE_KEYS.theme) as ThemeMode) || "auto";
const theme = ref<ThemeMode>(stored);

function apply(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

apply(theme.value);

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
