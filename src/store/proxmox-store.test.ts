import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const pinned = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn() } }));
vi.mock("@/plugins/pinned-http", () => ({
  PinnedHttp: { request: (opts: unknown) => pinned(opts) },
}));

import { useConnectionStore } from "@/store/connection-store";
import { useProxmoxStore } from "@/store/proxmox-store";

const FP_A = "AA:11";
const FP_B = "BB:22";
let netin = 1_000_000;

function serve(fingerprint = FP_A) {
  pinned.mockImplementation(async (req: { url: string }) => {
    const path = new URL(req.url).pathname;
    const body = (data: unknown) => ({ status: 200, headers: {}, data: JSON.stringify({ data }), fingerprint });
    if (path.endsWith("/access/ticket")) return body({ ticket: "T" });
    if (path.endsWith("/cluster/resources"))
      return body([
        { type: "node", node: "pve", status: "online" },
        { type: "lxc", vmid: 104, name: "jellyfin", node: "pve", status: "running", cpu: 0.2, maxcpu: 4, mem: 1, maxmem: 2, disk: 1, maxdisk: 2, netin, netout: 0, uptime: 1, template: 0 },
      ]);
    if (path.endsWith("/nodes/pve/status"))
      return body({ cpu: 0.1, cpuinfo: { cpus: 4 }, memory: { used: 1, total: 2 }, uptime: 1, pveversion: "pve-manager/8.3.2/x" });
    return { status: 404, headers: {}, data: "", fingerprint };
  });
}

function configure(pin?: string) {
  const conn = useConnectionStore();
  const url = "https://192.168.1.10:8006";
  conn.services.proxmox = { status: "ok", url, username: "homelab@pve", certSha256: pin, certUrl: pin ? url : undefined };
  conn.passwords.proxmox = "pw";
  return conn;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useProxmoxStore().reset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  pinned.mockReset();
  netin = 1_000_000;
  serve();
});
afterEach(() => vi.useRealTimers());

describe("network rates", () => {
  it("has no rate after one sample, then bytes per second between two", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch();
    expect(pve.state).toBe("ready");
    expect(pve.rates[104]).toBeUndefined();

    vi.advanceTimersByTime(5000);
    netin += 5_000_000;
    await pve.fetch();
    expect(pve.rates[104]?.rx).toBe(1_000_000);
  });

  it("reads a counter that went backwards (guest restarted) as 0", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch();
    vi.advanceTimersByTime(5000);
    netin = 10;
    await pve.fetch();
    expect(pve.rates[104]?.rx).toBe(0);
  });
});

describe("certificate pinning", () => {
  it("pins the fingerprint seen on first contact", async () => {
    const conn = configure(undefined);
    await useProxmoxStore().fetch();
    expect(conn.services.proxmox.certSha256).toBe(FP_A);
  });

  it("stops on a changed certificate and sends nothing more until trusted", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch();

    pinned.mockReset();
    pinned.mockRejectedValue(Object.assign(new Error("Certificat changé"), { code: "cert_mismatch", data: { fingerprint: FP_B } }));
    await pve.fetch();
    expect(pve.certMismatch).toEqual({ expected: FP_A, received: FP_B });
    expect(pve.state).toBe("ready");

    pinned.mockClear();
    await pve.fetch();
    expect(pinned).not.toHaveBeenCalled();
  });

  it("trusts the new certificate on request and reloads", async () => {
    const conn = configure(FP_A);
    const pve = useProxmoxStore();
    pinned.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "cert_mismatch", data: { fingerprint: FP_B } }));
    await pve.fetch();
    expect(pve.certMismatch?.received).toBe(FP_B);

    serve(FP_B);
    await pve.trustNewCert();
    expect(conn.services.proxmox.certSha256).toBe(FP_B);
    expect(pve.certMismatch).toBeUndefined();
    expect(pinned.mock.calls.at(-1)![0].pin).toBe(FP_B);
    expect(pve.state).toBe("ready");
  });
});

describe("sampling (I1, M2)", () => {
  it("ignores a refresh whose counters did not move yet, then rates over the real interval", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch(); // t0
    vi.advanceTimersByTime(5000);
    netin += 5_000_000;
    await pve.fetch(); // t5: 1 Mo/s
    expect(pve.rates[104]?.rx).toBe(1_000_000);

    vi.advanceTimersByTime(5000);
    await pve.fetch(); // t10: Proxmox has not refreshed its counters
    expect(pve.rates[104]?.rx).toBe(1_000_000);

    vi.advanceTimersByTime(5000);
    netin += 10_000_000;
    await pve.fetch(); // t15: 10 Mo over the 10 s since t5
    expect(pve.rates[104]?.rx).toBe(1_000_000);
  });

  it("reads still counters as 0 once Proxmox has surely refreshed", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch();
    vi.advanceTimersByTime(5000);
    netin += 5_000_000;
    await pve.fetch();
    vi.advanceTimersByTime(20000);
    await pve.fetch();
    expect(pve.rates[104]?.rx).toBe(0);
  });

  it("does not start a refresh while one is still running", async () => {
    configure(FP_A);
    const pve = useProxmoxStore();
    await pve.fetch(); // signed in, ticket held
    serve();
    const base = pinned.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let resources = 0;
    pinned.mockImplementation(async (req: { url: string }) => {
      if (req.url.endsWith("/cluster/resources")) {
        resources++;
        await gate;
      }
      return base(req);
    });
    const first = pve.fetch();
    await vi.advanceTimersByTimeAsync(5000);
    const second = pve.fetch();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await Promise.all([first, second]);
    expect(resources).toBe(1);
  });
});

describe("trusting a new certificate (I2)", () => {
  it("does not overwrite a pin that changed since the alert", async () => {
    const conn = configure(FP_A);
    const pve = useProxmoxStore();
    pve.certMismatch = { expected: FP_A, received: FP_B };
    conn.services.proxmox.certSha256 = "CC:33";
    await pve.trustNewCert();
    expect(conn.services.proxmox.certSha256).toBe("CC:33");
    expect(pve.certMismatch).toBeUndefined();
  });
});

