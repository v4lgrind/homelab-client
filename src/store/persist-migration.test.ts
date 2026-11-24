import { describe, expect, it, vi } from "vitest";
import { createApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));

import { useConnectionStore } from "@/store/connection-store";

// Review C1: the persistence plugin applies `pick` to what it reads back, so a
// legacy rootDomain must be picked too or the migration never sees it — and the
// next save erases it for good. Boot the real plugin on a legacy payload.
describe("hydrating a legacy connection state", () => {
  it("rebuilds subdomain + root domain addresses", () => {
    localStorage.setItem(
      "connection",
      JSON.stringify({
        rootDomain: "valgrind.cloud",
        services: {
          radarr: { subdomain: "radarr", status: "ok" },
          sonarr: { subdomain: "sonarr", host: "http://192.168.1.19:8989", status: "ok" },
        },
      }),
    );
    const pinia = createPinia();
    pinia.use(piniaPluginPersistedstate);
    createApp({}).use(pinia);
    setActivePinia(pinia);

    const c = useConnectionStore();
    expect(c.urlOf("radarr")).toBe("https://radarr.valgrind.cloud");
    expect(c.urlOf("sonarr")).toBe("http://192.168.1.19:8989");
    expect((c.$state as unknown as Record<string, unknown>).rootDomain).toBeUndefined();
  });
});
