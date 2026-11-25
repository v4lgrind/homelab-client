import { beforeEach, describe, expect, it, vi } from "vitest";

const pinnedRequest = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@/plugins/pinned-http", () => ({
  PinnedHttp: { request: (opts: unknown) => pinnedRequest(opts) },
}));

import { CertMismatchError, ServiceHttp } from "@/services/http";
import { createPinnedTransport } from "@/services/pinned-transport";

const BASE = "https://192.168.1.10:8006";
const FP_A = "AA:11";
const FP_B = "BB:22";

function client(pin: string | undefined, onFirstSeen = vi.fn()) {
  return new ServiceHttp(BASE, "", "Cookie", createPinnedTransport(() => pin, onFirstSeen));
}

beforeEach(() => {
  pinnedRequest.mockReset();
  pinnedRequest.mockResolvedValue({ status: 200, headers: {}, data: '{"data":{"ok":1}}', fingerprint: FP_A });
});

describe("pinned transport", () => {
  it("reports the fingerprint seen on first contact", async () => {
    const seen = vi.fn();
    await client(undefined, seen).get("/api2/json/version");
    expect(seen).toHaveBeenCalledWith(FP_A);
    expect(pinnedRequest.mock.calls[0][0].pin).toBeUndefined();
  });

  it("sends the pin and does not report again once pinned", async () => {
    const seen = vi.fn();
    await client(FP_A, seen).get("/api2/json/version");
    expect(seen).not.toHaveBeenCalled();
    expect(pinnedRequest.mock.calls[0][0].pin).toBe(FP_A);
  });

  it("turns a cert_mismatch rejection into CertMismatchError", async () => {
    pinnedRequest.mockRejectedValue(Object.assign(new Error("Certificat changé"), { code: "cert_mismatch", data: { fingerprint: FP_B } }));
    const err = (await client(FP_A).get("/x").catch((e) => e)) as CertMismatchError;
    expect(err).toBeInstanceOf(CertMismatchError);
    expect(err.kind).toBe("cert");
    expect(err.received).toBe(FP_B);
  });

  it("parses a JSON body and maps an empty one to null", async () => {
    expect(await client(FP_A).get("/x")).toEqual({ data: { ok: 1 } });
    pinnedRequest.mockResolvedValue({ status: 200, headers: {}, data: "", fingerprint: FP_A });
    expect(await client(FP_A).get("/x")).toBeNull();
  });

  it("passes a string body through and serialises an object", async () => {
    await client(FP_A).post("/login", "username=a%40pve&password=p", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(pinnedRequest.mock.calls[0][0].data).toBe("username=a%40pve&password=p");
    expect(pinnedRequest.mock.calls[0][0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    await client(FP_A).post("/x", { a: 1 });
    expect(pinnedRequest.mock.calls[1][0].data).toBe('{"a":1}');
  });
});
