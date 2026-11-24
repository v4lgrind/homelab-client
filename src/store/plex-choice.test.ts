import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: "dev-id" }), set: async () => {}, remove: async () => {} },
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: async () => {}, close: async () => {} } }));

import { useConnectionStore } from "@/store/connection-store";
import type { PlexResource } from "@/types/media";

const A = "https://192-168-1-19.aaa.plex.direct:32400";
const B = "https://82-66-186-177.bbb.plex.direct:32400";
const mine: PlexResource = {
  name: "v4lgrind", product: "Plex Media Server", provides: "server", clientIdentifier: "srv-a",
  owned: true, accessToken: "tok-a", connections: [{ uri: A, local: true }],
};
const shared: PlexResource = {
  name: "Serveur", product: "Plex Media Server", provides: "server", clientIdentifier: "srv-b",
  owned: false, accessToken: "tok-b", connections: [{ uri: B, local: false }],
};

function plexTv(servers: PlexResource[]) {
  request.mockImplementation(async (opts: { url: string }) => {
    if (opts.url.includes("plex.tv/api/v2/resources")) return { status: 200, data: servers, headers: {} };
    // Probes hit /identity, the connection test hits the server root.
    if (opts.url.startsWith(A) || opts.url.startsWith(B)) {
      const friendlyName = opts.url.startsWith(A) ? "v4lgrind" : "Serveur";
      return { status: 200, data: { MediaContainer: { version: "1.42", friendlyName } }, headers: {} };
    }
    throw new Error(`unexpected ${opts.url}`);
  });
}
const probed = () =>
  request.mock.calls.map((c) => (c[0] as { url: string }).url).filter((u) => u.endsWith("/identity"));

function signedIn() {
  const c = useConnectionStore();
  c.apiKeys.plex = "acct";
  return c;
}

beforeEach(() => {
  request.mockReset();
  setActivePinia(createPinia());
});

describe("choosing the Plex server", () => {
  it("offers the list, without probing, when the account sees several servers", async () => {
    plexTv([shared, mine]);
    const c = signedIn();

    expect(await c.discoverPlex()).toBe(false);
    expect(c.plexChoices.map((s) => s.name)).toEqual(["v4lgrind", "Serveur"]);
    expect(c.services.plex.status).toBe("idle");
    expect(probed()).toEqual([]);
  });

  it("connects to the chosen server only, and remembers it", async () => {
    plexTv([shared, mine]);
    const c = signedIn();
    await c.discoverPlex();

    const ok = await c.selectPlexServer("srv-a");
    expect(c.services.plex.error).toBeUndefined();
    expect(ok).toBe(true);
    expect(probed().every((u) => u.startsWith(A))).toBe(true);
    expect(c.services.plex.serverId).toBe("srv-a");
    expect(c.services.plex.serverName).toBe("v4lgrind");
    expect(c.services.plex.baseUrl).toBe(A);
    expect(c.plexChoices).toEqual([]);
  });

  it("skips the list when there is a single server", async () => {
    plexTv([mine]);
    const c = signedIn();

    expect(await c.discoverPlex()).toBe(true);
    expect(c.plexChoices).toEqual([]);
    expect(c.services.plex.serverId).toBe("srv-a");
  });

  it("reuses the remembered server", async () => {
    plexTv([shared, mine]);
    const c = signedIn();
    c.services.plex.serverId = "srv-a";

    expect(await c.discoverPlex()).toBe(true);
    expect(c.plexChoices).toEqual([]);
    expect(c.services.plex.baseUrl).toBe(A);
  });

  it("offers the list again when the remembered server is gone", async () => {
    plexTv([shared, mine]);
    const c = signedIn();
    c.services.plex.serverId = "srv-gone";

    expect(await c.discoverPlex()).toBe(false);
    expect(c.plexChoices).toHaveLength(2);
    expect(c.services.plex.error).toBeUndefined();
  });

  it("can be cancelled", async () => {
    plexTv([shared, mine]);
    const c = signedIn();
    await c.discoverPlex();

    c.cancelPlexChoice();
    expect(c.plexChoices).toEqual([]);
    expect(c.services.plex.status).toBe("idle");
    expect(c.apiKeys.plex).toBe("acct");
  });

  it("can be changed later without a new code", async () => {
    plexTv([shared, mine]);
    const c = signedIn();
    c.services.plex.serverId = "srv-a";
    await c.discoverPlex();

    await c.changePlexServer();
    expect(c.plexChoices).toHaveLength(2);
  });
});
