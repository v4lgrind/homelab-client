import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

import TorrentsPage from "@/pages/TorrentsPage.vue";
import { useConnectionStore } from "@/store/connection-store";

const NOT_CONFIGURED = "Configure qBittorrent";

function mountPage() {
  return mount(TorrentsPage, {
    global: { stubs: { BottomNav: true, BottomSheet: true } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: [], headers: {} });
});

// The page used to look only at the qui proxy key, so a direct connection
// (qBittorrent's own address, with or without a login) showed "not configured".
describe("TorrentsPage in direct mode", () => {
  it("lists torrents with an address and credentials, no qui proxy", async () => {
    const conn = useConnectionStore();
    conn.services.qbittorrent.authType = "userpass";
    conn.services.qbittorrent.url = "http://192.168.1.19:8080";
    conn.services.qbittorrent.username = "admin";
    conn.passwords.qbittorrent = "secret";

    const page = mountPage();

    expect(page.text()).not.toContain(NOT_CONFIGURED);
    await vi.waitFor(() =>
      expect(request.mock.calls.some(([o]) => String(o.url).includes("/api/v2/torrents/info"))).toBe(true),
    );
  });

  it("lists torrents with just an address (subnet whitelisted)", () => {
    const conn = useConnectionStore();
    conn.services.qbittorrent.authType = "userpass";
    conn.services.qbittorrent.url = "http://192.168.1.19:8080";

    expect(mountPage().text()).not.toContain(NOT_CONFIGURED);
  });

  it("still asks for setup when nothing is filled in", () => {
    useConnectionStore().services.qbittorrent.authType = "userpass";
    expect(mountPage().text()).toContain(NOT_CONFIGURED);
  });
});
