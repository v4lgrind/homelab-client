import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: (opts: unknown) => request(opts) },
}));

import { HttpError, ServiceHttp } from "@/services/http";
import { createQbitClient } from "@/services/qbittorrent";

// Tinyauth answers 401 itself, before the request reaches the service, when no
// path.allow rule lets /api through. It flags those responses with
// x-tinyauth-location. Reporting them as "Clé API invalide" sends the user
// hunting for a bad key when the key is fine.
const TINYAUTH_401 = {
  status: 401,
  data: { message: "Unauthorized", status: 401 },
  headers: { "x-tinyauth-location": "https://tinyauth.example.com/login?login_for=app" },
};

beforeEach(() => request.mockReset());

describe("requests blocked by tinyauth", () => {
  it("are reported as a gate block, not as a bad API key", async () => {
    request.mockResolvedValue(TINYAUTH_401);
    const err = await new ServiceHttp("https://radarr.example.com", "key")
      .get<never>("/api/v3/system/status")
      .catch((e: HttpError) => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.kind).toBe("gate");
    expect(err.message).toMatch(/tinyauth/i);
  });

  it("match the header regardless of casing", async () => {
    request.mockResolvedValue({ ...TINYAUTH_401, headers: { "X-Tinyauth-Location": "x" } });
    const err = await new ServiceHttp("https://radarr.example.com", "key").get<never>("/x").catch((e: HttpError) => e);
    expect(err.kind).toBe("gate");
  });

  it("still report a plain 401 as a bad API key", async () => {
    request.mockResolvedValue({ status: 401, data: {}, headers: {} });
    const err = await new ServiceHttp("https://radarr.example.com", "key").get<never>("/x").catch((e: HttpError) => e);
    expect(err.kind).toBe("auth");
  });

  it("are detected on the qui proxy too", async () => {
    request.mockResolvedValue(TINYAUTH_401);
    const err = await createQbitClient({ mode: "proxy", proxyUrl: "https://qui.example.com/proxy/k" })
      .getTransferInfo()
      .catch((e: unknown) => e);
    expect((err as HttpError).kind).toBe("gate");
  });
});
