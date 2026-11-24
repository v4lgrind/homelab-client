import { beforeEach, describe, expect, it, vi } from "vitest";

const setStyle = vi.fn(async (_o: unknown) => {});

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: (o: unknown) => setStyle(o) },
  Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
}));

// The status bar icons are drawn by Android, which follows the phone's theme,
// not the app's: a phone in light mode with the app forced dark drew dark icons
// on black. The app must set the icon colour from its own effective theme.
let systemDark = false;
let onSystemChange: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  setStyle.mockClear();
  localStorage.clear();
  systemDark = false;
  onSystemChange = undefined;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("dark") && systemDark;
    },
    addEventListener: (_: string, cb: () => void) => {
      onSystemChange = cb;
    },
  })) as unknown as typeof window.matchMedia;
});

async function load() {
  const { useTheme } = await import("@/composables/useTheme");
  return useTheme();
}

describe("status bar icons", () => {
  it("are light on the app's dark theme, even with the phone in light mode", async () => {
    const t = await load();
    t.setTheme("dark");
    expect(setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("are dark on the app's light theme, even with the phone in dark mode", async () => {
    systemDark = true;
    const t = await load();
    t.setTheme("light");
    expect(setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
  });

  it("follow the phone in auto mode, including when it switches", async () => {
    await load();
    expect(setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });

    systemDark = true;
    onSystemChange?.();
    expect(setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });

  it("are set at startup from the saved theme", async () => {
    localStorage.setItem("homelab_theme", "dark");
    await load();
    expect(setStyle).toHaveBeenLastCalledWith({ style: "DARK" });
  });
});
