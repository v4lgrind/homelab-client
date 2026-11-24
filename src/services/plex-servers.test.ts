import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: "dev-id" }), set: async () => {}, remove: async () => {} },
}));

import { connectServer, listServers } from "@/services/plex";
import type { PlexResource } from "@/types/media";

const LAN = "https://192-168-1-19.aaa.plex.direct:32400";
const DOCKER = "https://172-17-0-1.aaa.plex.direct:32400";
const WAN = "https://82-66-186-177.aaa.plex.direct:32400";
const RELAY = "https://172-105-86-243.aaa.plex.direct:8443";

const v4lgrind: PlexResource = {
  name: "v4lgrind",
  product: "Plex Media Server",
  provides: "server",
  clientIdentifier: "srv-a",
  owned: true,
  accessToken: "srv-token",
  connections: [
    { uri: DOCKER, local: true },
    { uri: LAN, local: true },
    { uri: WAN, local: false },
    { uri: RELAY, local: false, relay: true },
  ],
};

/** Answer /identity per host after a delay in ms; any other host times out
 *  after 5 s, like the real probe timeout. */
function serve(hosts: Record<string, number>) {
  request.mockImplementation((opts: { url: string }) => {
    const base = Object.keys(hosts).find((h) => opts.url.startsWith(h));
    const behaviour = base ? hosts[base] : "dead";
    if (behaviour === "dead") {
      return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000));
    }
    return new Promise((res) => setTimeout(() => res({ status: 200, data: {}, headers: {} }), behaviour));
  });
}

beforeEach(() => {
  request.mockReset();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("listServers", () => {
  it("keeps servers only, the user's own first", async () => {
    vi.useRealTimers();
    const shared: PlexResource = { ...v4lgrind, name: "Serveur", clientIdentifier: "srv-b", owned: false };
    const player: PlexResource = { ...v4lgrind, name: "Pixel", clientIdentifier: "p", provides: "player" };
    request.mockResolvedValue({ status: 200, data: [shared, player, v4lgrind], headers: {} });

    const servers = await listServers("acct");
    expect(servers.map((s) => s.name)).toEqual(["v4lgrind", "Serveur"]);
  });
});

// Before: every address of every server was awaited, the slowest included —
// about 29 s although the LAN answered in 0.1 s.
describe("connectServer", () => {
  it("settles on a LAN address as soon as it answers", async () => {
    serve({ [LAN]: 100 }); // Docker, WAN and relay time out after 5 s
    let result: { uri: string } | undefined;
    connectServer(v4lgrind, "acct").then((s) => (result = s));

    await vi.advanceTimersByTimeAsync(999);
    expect(result?.uri).toBe(LAN);
  });

  it("falls back to the public address when no LAN address answers", async () => {
    serve({ [WAN]: 300 });
    const done = connectServer(v4lgrind, "acct");
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await done).uri).toBe(WAN);
  });

  it("fails clearly when nothing answers", async () => {
    request.mockRejectedValue(new Error("timeout"));
    const err = (await connectServer(v4lgrind, "acct").catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("Serveur Plex injoignable depuis ce réseau");
  });
});
