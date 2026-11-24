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

import { HttpError } from "@/services/http";
import { createQbitClient } from "@/services/qbittorrent";
import { useConnectionStore } from "@/store/connection-store";

// qBittorrent can skip its login for whitelisted subnets (LAN / VPN), so in
// direct mode the username and password are optional.
const URL_ = "http://192.168.1.19:8080";

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: {}, headers: {} });
});

describe("qBittorrent direct mode without credentials", () => {
  it("skips the login and sends no cookie", async () => {
    await createQbitClient({ mode: "direct", url: URL_ }).getTransferInfo();

    expect(request).toHaveBeenCalledTimes(1);
    const call = request.mock.calls[0][0];
    expect(call.url).toBe(`${URL_}/api/v2/transfer/info`);
    expect(call.headers.Cookie).toBeUndefined();
  });

  it("explains a 403 instead of retrying a login it cannot do", async () => {
    request.mockResolvedValue({ status: 403, data: "Forbidden", headers: {} });
    const err = (await createQbitClient({ mode: "direct", url: URL_ })
      .getTransferInfo()
      .catch((e: unknown) => e)) as HttpError;

    expect(request).toHaveBeenCalledTimes(1);
    expect(err.kind).toBe("auth");
    expect(err.message).toBe(
      "qBittorrent demande un login — renseigne-le, ou autorise ton sous-réseau dans qBittorrent",
    );
  });
});

describe("qBittorrent credentials in the store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  function directStore() {
    const c = useConnectionStore();
    c.setAuthType("qbittorrent", "userpass");
    c.setUrl("qbittorrent", URL_);
    return c;
  }

  it("are optional when both are empty", () => {
    expect(directStore().qbitConfig).not.toBeNull();
  });

  it("must come as a pair", async () => {
    const c = directStore();
    c.services.qbittorrent.username = "u";

    expect(await c.testService("qbittorrent")).toBe(false);
    expect(c.services.qbittorrent.error).toBe("Identifiant et mot de passe vont ensemble");
    expect(request).not.toHaveBeenCalled();
  });
});

// Review I1: the pair rule must hold for every caller (torrents tab polling),
// not only the connection test.
describe("qBittorrent client with half the credentials", () => {
  it("refuses before any request", async () => {
    const err = (await createQbitClient({ mode: "direct", url: URL_, username: "u" })
      .getTransferInfo()
      .catch((e: unknown) => e)) as HttpError;

    expect(err.message).toBe("Identifiant et mot de passe vont ensemble");
    expect(request).not.toHaveBeenCalled();
  });
});
