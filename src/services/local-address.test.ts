import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));

import { serviceBaseUrl } from "@/services/http";
import { createQbitClient } from "@/services/qbittorrent";
import { useConnectionStore } from "@/store/connection-store";
import { SERVICE_URL_ERROR } from "@/lib/service-url";

// A service can be reached at its public HTTPS domain or at a plain-HTTP LAN /
// VPN address (http://192.168.1.10:7878), which skips the reverse proxy.
describe("service addresses", () => {
  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue({ status: 200, data: {}, headers: {} });
  });

  it("use the full url as the base on device", () => {
    expect(serviceBaseUrl("radarr", "http://192.168.1.10:7878")).toBe("http://192.168.1.10:7878");
  });

  it("reach qBittorrent direct mode at its url", async () => {
    await createQbitClient({
      mode: "direct",
      url: "http://192.168.1.10:8080",
      username: "u",
      password: "p",
    }).getAppVersion();
    expect(request.mock.calls[0][0].url).toBe("http://192.168.1.10:8080/api/v2/auth/login");
  });
});

describe("address field", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // The input is bound with v-model, so setUrl runs on every keystroke. Any
  // normalisation that bites mid-word (stripping the "/" of "http:/") makes the
  // scheme impossible to type.
  it("lets the user type http:// one character at a time", () => {
    const c = useConnectionStore();
    let field = "";
    for (const ch of "http://192.168.1.10:7878") {
      c.setUrl("radarr", field + ch);
      field = c.services.radarr.url ?? "";
    }
    expect(field).toBe("http://192.168.1.10:7878");
    expect(c.urlOf("radarr")).toBe("http://192.168.1.10:7878");
  });

  it("defaults a bare hostname to https", () => {
    const c = useConnectionStore();
    c.setUrl("radarr", "radarr.example.com");
    expect(c.urlOf("radarr")).toBe("https://radarr.example.com");
    expect(c.urlError("radarr")).toBeUndefined();
  });

  it("flags an invalid address and yields no url", () => {
    const c = useConnectionStore();
    c.setUrl("radarr", "ftp://x");
    expect(c.urlOf("radarr")).toBe("");
    expect(c.urlError("radarr")).toBe(SERVICE_URL_ERROR);
  });

  it("does not flag an empty field", () => {
    const c = useConnectionStore();
    c.setUrl("radarr", "");
    expect(c.urlError("radarr")).toBeUndefined();
  });
});
