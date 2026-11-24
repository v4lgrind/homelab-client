import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));

import { withApiKey } from "@/services/arr";

// Review I3: with no usable address the base is "", and every URL starts with
// "" — the Radarr/Sonarr key would be appended to TMDB poster URLs.
describe("withApiKey", () => {
  it("never keys a URL when there is no base", () => {
    const tmdb = "https://image.tmdb.org/t/p/w342/poster.jpg";
    expect(withApiKey(tmdb, "", "secret")).toBe(tmdb);
  });

  it("keys our own cover URLs", () => {
    expect(withApiKey("http://192.168.1.19:7878/api/v3/mediacover/1/poster-500.jpg", "http://192.168.1.19:7878", "k"))
      .toBe("http://192.168.1.19:7878/api/v3/mediacover/1/poster-500.jpg?apikey=k");
  });
});
