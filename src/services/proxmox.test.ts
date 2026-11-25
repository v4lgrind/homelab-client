import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));

import { HttpError, type HttpTransport, type TransportRequest } from "@/services/http";
import { createProxmoxClient, proxmoxUrlError, sortGuests } from "@/services/proxmox";
import type { PveGuest } from "@/types/proxmox";

const URL_ = "https://192.168.1.10:8006";
const ok = (data: unknown) => ({ status: 200, headers: {}, data: { data } });
const unauthorized = { status: 401, headers: {}, data: null };

type Handler = (req: TransportRequest) => { status: number; headers: Record<string, string>; data: unknown };
let calls: TransportRequest[];
let handler: Handler;
const transport: HttpTransport = async (req) => {
  calls.push(req);
  return handler(req);
};

function routes(map: Record<string, unknown>): Handler {
  return (req) => {
    const path = req.url.replace(URL_, "");
    if (path === "/api2/json/access/ticket") return ok({ ticket: "TICKET1", CSRFPreventionToken: "x" });
    if (path in map) return ok(map[path]);
    return { status: 404, headers: {}, data: null };
  };
}

const client = () => createProxmoxClient({ url: URL_, username: "homelab@pve", password: "s3cret&", transport });

const RESOURCES = [
  { id: "node/pve", type: "node", node: "pve", status: "online" },
  { id: "qemu/100", type: "qemu", vmid: 100, name: "docker-host", node: "pve", status: "running", cpu: 0.41, maxcpu: 4, mem: 11.8e9, maxmem: 16e9, disk: 0, maxdisk: 64e9, netin: 1000, netout: 500, uptime: 3600, template: 0, tags: "docker" },
  { id: "lxc/104", type: "lxc", vmid: 104, name: "jellyfin", node: "pve", status: "running", cpu: 0.23, maxcpu: 4, mem: 2.1e9, maxmem: 4e9, disk: 18e9, maxdisk: 32e9, netin: 2000, netout: 100, uptime: 7200, template: 0, tags: "media;gpu" },
  { id: "qemu/9000", type: "qemu", vmid: 9000, name: "debian-tpl", node: "pve", status: "stopped", cpu: 0, maxcpu: 2, mem: 0, maxmem: 2e9, disk: 0, maxdisk: 10e9, netin: 0, netout: 0, uptime: 0, template: 1 },
  { id: "storage/pve/tank", type: "storage", storage: "tank", node: "pve", plugintype: "zfspool", status: "available", disk: 7.3e12, maxdisk: 8e12 },
];
const NODE_STATUS = {
  cpu: 0.18,
  cpuinfo: { cpus: 12 },
  memory: { used: 40e9, total: 62e9 },
  swap: { used: 3, total: 100 },
  loadavg: ["1.24", "1.10", "0.98"],
  uptime: 5443200,
  pveversion: "pve-manager/8.3.2/3e76eec21c4a14a7",
};

beforeEach(() => {
  calls = [];
  handler = routes({ "/api2/json/version": { version: "8.3.2" } });
});

describe("Proxmox login", () => {
  it("posts form-encoded credentials, then sends the ticket as a cookie", async () => {
    expect(await client().login()).toBe("8.3.2");
    const [login, version] = calls;
    expect(login.method).toBe("POST");
    expect(login.url).toBe(`${URL_}/api2/json/access/ticket`);
    expect(login.data).toBe("username=homelab%40pve&password=s3cret%26");
    expect(login.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(version.headers.Cookie).toBe("PVEAuthCookie=TICKET1");
  });

  it("explains a refused login", async () => {
    handler = () => unauthorized;
    const err = (await client().login().catch((e) => e)) as HttpError;
    expect(err).toBeInstanceOf(HttpError);
    expect(err.message).toBe("Identifiant ou mot de passe incorrect");
  });

  it("re-logs in exactly once on a 401 and gives up on a second one", async () => {
    const c = client();
    handler = routes({ "/api2/json/cluster/resources": RESOURCES, "/api2/json/nodes/pve/status": NODE_STATUS });
    await c.snapshot();
    // Ticket now expires: first GET 401s, re-login, retry succeeds.
    let once = true;
    const base = handler;
    handler = (req) => {
      if (req.url.endsWith("/cluster/resources") && once) {
        once = false;
        return unauthorized;
      }
      return base(req);
    };
    calls = [];
    await c.snapshot();
    expect(calls.filter((r) => r.url.endsWith("/access/ticket"))).toHaveLength(1);

    // Every GET 401s: one re-login, then an error — no loop.
    handler = (req) => (req.url.endsWith("/access/ticket") ? base(req) : unauthorized);
    calls = [];
    await expect(c.snapshot()).rejects.toBeInstanceOf(HttpError);
    expect(calls.filter((r) => r.url.endsWith("/access/ticket"))).toHaveLength(1);
  });
});

describe("Proxmox permissions (M1)", () => {
  it("does not log in again on a 403, and explains it", async () => {
    const c = client();
    handler = (req) => (req.url.endsWith("/access/ticket") ? ok({ ticket: "T" }) : { status: 403, headers: {}, data: null });
    const err = (await c.snapshot().catch((e) => e)) as HttpError;
    expect(calls.filter((r) => r.url.endsWith("/access/ticket"))).toHaveLength(1);
    expect(err.message).toBe("Accès refusé par Proxmox — droits insuffisants (rôle PVEAuditor ?)");
  });
});

describe("Proxmox snapshot", () => {
  it("normalises the node, guests and storages", async () => {
    handler = routes({ "/api2/json/cluster/resources": RESOURCES, "/api2/json/nodes/pve/status": NODE_STATUS });
    const s = await client().snapshot();
    expect(s.node).toMatchObject({ node: "pve", cpu: 18, cores: 12, memUsed: 40e9, memTotal: 62e9, swapPercent: 3, load1: 1.24, version: "8.3.2" });
    const vm = s.guests.find((g) => g.vmid === 100)!;
    const ct = s.guests.find((g) => g.vmid === 104)!;
    expect(vm).toMatchObject({ type: "qemu", running: true, cpu: 41, cores: 4, diskTotal: 64e9, tags: ["docker"] });
    expect(vm.diskUsed).toBeUndefined();
    expect(ct).toMatchObject({ type: "lxc", diskUsed: 18e9, tags: ["media", "gpu"], netIn: 2000 });
    expect(s.guests.find((g) => g.vmid === 9000)!.template).toBe(true);
    expect(s.storages).toEqual([{ id: "tank", type: "zfspool", used: 7.3e12, total: 8e12, percent: 91 }]);
  });
});

describe("sortGuests", () => {
  const g = (vmid: number, running: boolean, cpu: number, template = false) =>
    ({ vmid, running, cpu, template }) as PveGuest;

  it("puts running guests first by CPU, then stopped by vmid, without templates", () => {
    const out = sortGuests([g(110, false, 0), g(101, true, 6), g(9000, false, 0, true), g(100, true, 41), g(103, false, 0)]);
    expect(out.map((x) => x.vmid)).toEqual([100, 101, 103, 110]);
  });
});

describe("guestIp", () => {
  const lxc = { vmid: 104, type: "lxc" } as PveGuest;
  const vm = { vmid: 100, type: "qemu" } as PveGuest;

  it("reads a container's first non-loopback address", async () => {
    handler = routes({
      "/api2/json/nodes/pve/lxc/104/interfaces": [
        { name: "lo", inet: "127.0.0.1/8" },
        { name: "eth0", inet: "192.168.1.24/24" },
      ],
    });
    expect(await client().guestIp(lxc, "pve")).toBe("192.168.1.24");
  });

  it("reads a VM's address from the QEMU agent", async () => {
    handler = routes({
      "/api2/json/nodes/pve/qemu/100/agent/network-get-interfaces": {
        result: [
          { name: "lo", "ip-addresses": [{ "ip-address": "127.0.0.1", "ip-address-type": "ipv4" }] },
          { name: "ens18", "ip-addresses": [{ "ip-address": "fe80::1", "ip-address-type": "ipv6" }, { "ip-address": "192.168.1.30", "ip-address-type": "ipv4" }] },
        ],
      },
    });
    expect(await client().guestIp(vm, "pve")).toBe("192.168.1.30");
  });

  it("gives undefined when the agent is missing or forbidden", async () => {
    handler = (req) => (req.url.endsWith("/access/ticket") ? ok({ ticket: "T" }) : { status: 403, headers: {}, data: null });
    expect(await client().guestIp(vm, "pve")).toBeUndefined();
    handler = (req) => (req.url.endsWith("/access/ticket") ? ok({ ticket: "T" }) : { status: 500, headers: {}, data: null });
    expect(await client().guestIp(lxc, "pve")).toBeUndefined();
  });
});

describe("proxmoxUrlError", () => {
  it("accepts https on a private IPv4 only", () => {
    expect(proxmoxUrlError("https://192.168.1.10:8006")).toBeUndefined();
    const msg = "Proxmox se joint par son IP locale en https (ex. https://192.168.1.10:8006)";
    expect(proxmoxUrlError("http://192.168.1.10:8006")).toBe(msg);
    expect(proxmoxUrlError("https://pve.domaine.com")).toBe(msg);
    expect(proxmoxUrlError("https://8.8.8.8:8006")).toBe(msg);
  });
});
