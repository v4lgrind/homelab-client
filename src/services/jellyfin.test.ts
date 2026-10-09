import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async () => ({ value: "homelab-test-device" }),
    set: async () => {},
  },
}));

import { createJellyfinClient } from "@/services/jellyfin";

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: {} });
});

// Jellyfin 12 rejects the legacy X-Emby-Token header and api_key query param
// with a 401; only the MediaBrowser Authorization header and ApiKey work.
describe("Jellyfin 12 authentication", () => {
  it("sends the token in the MediaBrowser Authorization header", async () => {
    await createJellyfinClient("jellyfin.example.com", "tok123").getSystemInfo();

    const { headers } = request.mock.calls[0][0];
    expect(headers["X-Emby-Token"]).toBeUndefined();
    expect(headers.Authorization).toMatch(/^MediaBrowser /);
    expect(headers.Authorization).toContain('Token="tok123"');
  });

  it("authenticates session polling the same way", async () => {
    request.mockResolvedValue({ status: 200, data: [] });
    await createJellyfinClient("jellyfin.example.com", "tok123").getSessions();

    const { headers } = request.mock.calls[0][0];
    expect(headers["X-Emby-Token"]).toBeUndefined();
    expect(headers.Authorization).toContain('Token="tok123"');
  });

  it("puts the token in ApiKey on image URLs", () => {
    const url = createJellyfinClient("jellyfin.example.com", "tok123").imageUrl("item1");
    expect(url).toContain("ApiKey=tok123");
    expect(url).not.toContain("api_key");
  });
});
