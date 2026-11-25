import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  CapacitorHttp: { request: vi.fn(async () => ({ status: 200, data: {}, headers: {} })) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn() } }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

import StatsPage from "@/pages/StatsPage.vue";
import { useConnectionStore } from "@/store/connection-store";
import { useGlancesStore } from "@/store/glances-store";
import { useProxmoxStore } from "@/store/proxmox-store";

function configure({ glances = true, proxmox = true } = {}) {
  const conn = useConnectionStore();
  if (glances) conn.services.glances.url = "http://192.168.1.19:61208";
  if (proxmox) {
    conn.services.proxmox.url = "https://192.168.1.10:8006";
    conn.services.proxmox.username = "homelab@pve";
    conn.passwords.proxmox = "pw";
  }
  const g = useGlancesStore();
  const pve = useProxmoxStore();
  const gFetch = vi.spyOn(g, "fetch").mockResolvedValue(undefined);
  const pFetch = vi.spyOn(pve, "fetch").mockResolvedValue(undefined);
  return { gFetch, pFetch };
}

const mountPage = () =>
  mount(StatsPage, { global: { stubs: { BottomNav: true, SessionCard: true, ProxmoxPanel: true } } });

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("Stats: Machine / Proxmox selector", () => {
  it("shows the selector only when both are configured", () => {
    configure({ proxmox: false });
    expect(mountPage().find('[data-test="stats-tabs"]').exists()).toBe(false);

    setActivePinia(createPinia());
    configure();
    expect(mountPage().find('[data-test="stats-tabs"]').exists()).toBe(true);
  });

  it("polls only the visible tab, and stops when the page goes away", async () => {
    const { gFetch, pFetch } = configure();
    const page = mountPage();

    vi.advanceTimersByTime(3000);
    expect(gFetch).toHaveBeenCalled();
    expect(pFetch).not.toHaveBeenCalled();

    await page.get('[data-test="tab-proxmox"]').trigger("click");
    gFetch.mockClear();
    pFetch.mockClear();
    vi.advanceTimersByTime(5000);
    expect(pFetch).toHaveBeenCalled();
    expect(gFetch).not.toHaveBeenCalled();

    page.unmount();
    pFetch.mockClear();
    vi.advanceTimersByTime(20000);
    expect(pFetch).not.toHaveBeenCalled();
    expect(gFetch).not.toHaveBeenCalled();
  });

  it("remembers the tab picked", async () => {
    configure();
    const page = mountPage();
    await page.get('[data-test="tab-proxmox"]').trigger("click");
    page.unmount();
    expect(localStorage.getItem("homelab_stats_tab")).toContain("proxmox");
  });

  it("shows Proxmox alone when Glances is not configured", () => {
    const { gFetch, pFetch } = configure({ glances: false });
    mountPage();
    vi.advanceTimersByTime(5000);
    expect(pFetch).toHaveBeenCalled();
    expect(gFetch).not.toHaveBeenCalled();
  });
});
