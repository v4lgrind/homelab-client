import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const pinned = vi.fn();
const prefsSet = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: vi.fn() },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: (o: unknown) => prefsSet(o), remove: async () => {} },
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: vi.fn() } }));
vi.mock("@/plugins/pinned-http", () => ({
  PinnedHttp: { request: (opts: unknown) => pinned(opts) },
}));

import { useConnectionStore } from "@/store/connection-store";
import { useProxmoxStore } from "@/store/proxmox-store";

const body = (data: unknown) => ({ status: 200, headers: {}, data: JSON.stringify({ data }), fingerprint: "AA:11" });

beforeEach(() => {
  setActivePinia(createPinia());
  useProxmoxStore().reset();
  pinned.mockReset();
  prefsSet.mockReset();
  pinned.mockImplementation(async (req: { url: string }) =>
    req.url.endsWith("/access/ticket") ? body({ ticket: "T" }) : body({ version: "8.3.2" }),
  );
});

function setup(url: string, password = "pw") {
  const conn = useConnectionStore();
  conn.services.proxmox = { status: "idle", url, username: "homelab@pve" };
  conn.passwords.proxmox = password;
  return conn;
}

describe("testService('proxmox')", () => {
  it("refuses a domain without contacting it", async () => {
    const conn = setup("https://pve.domaine.com");
    expect(await conn.testService("proxmox")).toBe(false);
    expect(conn.services.proxmox.error).toBe("Proxmox se joint par son IP locale en https (ex. https://192.168.1.10:8006)");
    expect(pinned).not.toHaveBeenCalled();
  });

  it("asks for the realm before contacting Proxmox", async () => {
    const conn = setup("https://192.168.1.10:8006");
    conn.services.proxmox.username = "root";
    expect(await conn.testService("proxmox")).toBe(false);
    expect(conn.services.proxmox.error).toBe("Ajoute le royaume à l'identifiant : root@pam ou utilisateur@pve");
    expect(pinned).not.toHaveBeenCalled();
  });

  it("requires a username and a password", async () => {
    const conn = setup("https://192.168.1.10:8006", "");
    expect(await conn.testService("proxmox")).toBe(false);
    expect(conn.services.proxmox.error).toBe("Identifiant et mot de passe requis");
  });

  it("signs in, records the version, the pin and the password", async () => {
    const conn = setup("https://192.168.1.10:8006");
    expect(await conn.testService("proxmox")).toBe(true);
    expect(conn.services.proxmox.status).toBe("ok");
    expect(conn.services.proxmox.version).toBe("8.3.2");
    expect(conn.services.proxmox.certSha256).toBe("AA:11");
    expect(prefsSet).toHaveBeenCalledWith({ key: "homelab_password_proxmox", value: "pw" });
  });

  it("forgets the pinned certificate on reset", async () => {
    const conn = setup("https://192.168.1.10:8006");
    await conn.testService("proxmox");
    expect(conn.services.proxmox.certSha256).toBe("AA:11");
    await conn.resetService("proxmox");
    expect(conn.services.proxmox.certSha256).toBeUndefined();
    expect(useProxmoxStore().snapshot).toBeNull();
  });

  it("keeps the pin through edits that end on the same address (I3)", async () => {
    const conn = setup("https://192.168.1.10:8006");
    await conn.testService("proxmox");
    conn.setUrl("proxmox", "https://192.168.1.10:800");
    conn.setUrl("proxmox", "https://192.168.1.10:8006");
    pinned.mockClear();
    await conn.testService("proxmox");
    expect(pinned.mock.calls[0][0].pin).toBe("AA:11");
  });

  it("does not send a pin to another address, and pins that one afresh (I3)", async () => {
    const conn = setup("https://192.168.1.10:8006");
    await conn.testService("proxmox");
    conn.setUrl("proxmox", "https://192.168.1.11:8006");
    pinned.mockClear();
    pinned.mockImplementation(async (req: { url: string }) => ({
      ...(req.url.endsWith("/access/ticket") ? body({ ticket: "T" }) : body({ version: "8.3.2" })),
      fingerprint: "CC:33",
    }));
    await conn.testService("proxmox");
    expect(pinned.mock.calls[0][0].pin).toBeUndefined();
    expect(conn.services.proxmox.certSha256).toBe("CC:33");
  });

  it("clears a pending certificate alert when the address changes or a test succeeds (I2)", async () => {
    const conn = setup("https://192.168.1.10:8006");
    const pve = useProxmoxStore();
    pve.certMismatch = { expected: "AA:11", received: "BB:22" };
    conn.setUrl("proxmox", "https://192.168.1.11:8006");
    expect(pve.certMismatch).toBeUndefined();

    pve.certMismatch = { expected: "AA:11", received: "BB:22" };
    expect(await conn.testService("proxmox")).toBe(true);
    expect(pve.certMismatch).toBeUndefined();
  });

  it("clears the Proxmox state on resetAll (I2)", async () => {
    const conn = setup("https://192.168.1.10:8006");
    const pve = useProxmoxStore();
    pve.certMismatch = { expected: "AA:11", received: "BB:22" };
    await conn.resetAll();
    expect(pve.certMismatch).toBeUndefined();
  });
});
