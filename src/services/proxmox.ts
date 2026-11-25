import { HttpError, ServiceHttp, serviceBaseUrl, type HttpTransport } from "@/services/http";
import type { PveGuest, PveNode, PveSnapshot, PveStorage } from "@/types/proxmox";

export const PROXMOX_URL_ERROR = "Proxmox se joint par son IP locale en https (ex. https://192.168.1.10:8006)";
export const PROXMOX_REALM_ERROR = "Ajoute le royaume à l'identifiant : root@pam ou utilisateur@pve";
const LOGIN_ERROR = "Identifiant ou mot de passe incorrect";
const FORBIDDEN_ERROR = "Accès refusé par Proxmox — droits insuffisants (rôle PVEAuditor ?)";

/** Proxmox wording for the generic auth errors ServiceHttp raises. */
function proxmoxError(e: unknown): unknown {
  if (!(e instanceof HttpError)) return e;
  if (e.status === 403) return new HttpError(FORBIDDEN_ERROR, 403, "auth");
  if (e.status === 401) return new HttpError(LOGIN_ERROR, 401, "auth");
  return e;
}

/** Dotted IPv4 literal in 10/8, 172.16/12 or 192.168/16 (mirrors PinnedTls.java). */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
}

/**
 * Error to show for a Proxmox address the pinned transport would refuse, or
 * undefined. Blank is not an error here (the caller asks for an address).
 */
export function proxmoxUrlError(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && isPrivateIpv4(u.hostname) ? undefined : PROXMOX_URL_ERROR;
  } catch {
    return PROXMOX_URL_ERROR;
  }
}

/** Running guests by CPU (busiest first), then stopped ones by vmid; templates dropped. */
export function sortGuests(guests: PveGuest[]): PveGuest[] {
  return guests
    .filter((g) => !g.template)
    .sort((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1;
      return a.running ? b.cpu - a.cpu : a.vmid - b.vmid;
    });
}

// Raw API shapes (only the fields we read).
interface RawResource {
  type: string;
  node?: string;
  status?: string;
  vmid?: number;
  name?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  netin?: number;
  netout?: number;
  uptime?: number;
  template?: number;
  tags?: string;
  storage?: string;
  plugintype?: string;
}
interface RawNodeStatus {
  cpu?: number;
  cpuinfo?: { cpus?: number };
  memory?: { used?: number; total?: number };
  swap?: { used?: number; total?: number };
  loadavg?: string[];
  uptime?: number;
  pveversion?: string;
}
type Envelope<T> = { data: T };

const pct = (fraction: number | undefined) => Math.round((fraction ?? 0) * 100);

function toGuest(r: RawResource): PveGuest {
  const type = r.type === "lxc" ? "lxc" : "qemu";
  return {
    vmid: r.vmid ?? 0,
    name: r.name || `${type} ${r.vmid}`,
    type,
    running: r.status === "running",
    cpu: pct(r.cpu),
    cores: r.maxcpu ?? 0,
    memUsed: r.mem ?? 0,
    memTotal: r.maxmem ?? 0,
    // Proxmox reports 0 for a VM's disk: only the guest agent knows usage.
    diskUsed: type === "lxc" ? (r.disk ?? 0) : undefined,
    diskTotal: r.maxdisk ?? 0,
    netIn: r.netin ?? 0,
    netOut: r.netout ?? 0,
    uptime: r.uptime ?? 0,
    tags: (r.tags ?? "").split(/[;, ]+/).filter(Boolean),
    template: r.template === 1,
  };
}

function toNode(node: string, s: RawNodeStatus): PveNode {
  const swapTotal = s.swap?.total ?? 0;
  const load = s.loadavg?.[0] != null ? Number.parseFloat(s.loadavg[0]) : undefined;
  return {
    node,
    cpu: pct(s.cpu),
    cores: s.cpuinfo?.cpus,
    memUsed: s.memory?.used ?? 0,
    memTotal: s.memory?.total ?? 0,
    swapPercent: swapTotal > 0 ? Math.round(((s.swap?.used ?? 0) / swapTotal) * 100) : undefined,
    load1: Number.isFinite(load) ? load : undefined,
    uptime: s.uptime ?? 0,
    version: s.pveversion?.split("/")[1],
  };
}

export interface ProxmoxConfig {
  url: string;
  username: string;
  password: string;
  transport: HttpTransport;
}

/**
 * Read-only Proxmox VE client. Signs in with a username + password; the ticket
 * (valid 2 h) stays in memory and is renewed once on a 401.
 */
export function createProxmoxClient(cfg: ProxmoxConfig) {
  const base = serviceBaseUrl("proxmox", cfg.url);
  let ticket: string | undefined;

  const http = () => new ServiceHttp(base, ticket ? `PVEAuthCookie=${ticket}` : "", "Cookie", cfg.transport);

  async function authenticate(): Promise<void> {
    ticket = undefined;
    const body = new URLSearchParams({ username: cfg.username, password: cfg.password }).toString();
    try {
      const res = await http().post<Envelope<{ ticket: string }>>("/api2/json/access/ticket", body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      ticket = res.data.ticket;
    } catch (e) {
      throw proxmoxError(e);
    }
  }

  async function get<T>(path: string): Promise<T> {
    if (!ticket) await authenticate();
    try {
      return (await http().get<Envelope<T>>(path)).data;
    } catch (e) {
      // Only a 401 means the ticket expired; a 403 is a missing privilege that
      // a new ticket would not grant.
      if (!(e instanceof HttpError && e.status === 401)) throw proxmoxError(e);
    }
    await authenticate();
    try {
      return (await http().get<Envelope<T>>(path)).data;
    } catch (e) {
      throw proxmoxError(e);
    }
  }

  /** Signs in afresh and returns the PVE version ("8.3.2"). */
  async function login(): Promise<string> {
    await authenticate();
    const v = await get<{ version: string }>("/api2/json/version");
    return v.version;
  }

  async function snapshot(): Promise<PveSnapshot> {
    const resources = await get<RawResource[]>("/api2/json/cluster/resources");
    const nodes = resources.filter((r) => r.type === "node");
    const node = (nodes.find((n) => n.status === "online") ?? nodes[0])?.node;
    if (!node) throw new HttpError("Aucun nœud Proxmox trouvé", 0, "unknown");

    const status = await get<RawNodeStatus>(`/api2/json/nodes/${encodeURIComponent(node)}/status`);
    const guests = resources
      .filter((r) => (r.type === "qemu" || r.type === "lxc") && r.node === node)
      .map(toGuest);
    const storages: PveStorage[] = resources
      .filter((r) => r.type === "storage" && r.node === node && r.status === "available" && (r.maxdisk ?? 0) > 0)
      .map((r) => ({
        id: r.storage ?? "?",
        type: r.plugintype ?? "",
        used: r.disk ?? 0,
        total: r.maxdisk ?? 0,
        percent: Math.round(((r.disk ?? 0) / (r.maxdisk ?? 1)) * 100),
      }))
      .sort((a, b) => b.total - a.total);
    return { node: toNode(node, status), guests, storages };
  }

  /** The guest's first non-loopback IPv4, or undefined (no agent, no right…). */
  async function guestIp(g: PveGuest, node: string): Promise<string | undefined> {
    const n = encodeURIComponent(node);
    try {
      if (g.type === "lxc") {
        const ifaces = await get<{ name: string; inet?: string }[]>(`/api2/json/nodes/${n}/lxc/${g.vmid}/interfaces`);
        return ifaces.find((i) => i.name !== "lo" && i.inet)?.inet?.split("/")[0];
      }
      const res = await get<{
        result: { name: string; "ip-addresses"?: { "ip-address": string; "ip-address-type": string }[] }[];
      }>(`/api2/json/nodes/${n}/qemu/${g.vmid}/agent/network-get-interfaces`);
      for (const i of res.result ?? []) {
        if (i.name === "lo") continue;
        const v4 = i["ip-addresses"]?.find((a) => a["ip-address-type"] === "ipv4");
        if (v4) return v4["ip-address"];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  return { login, snapshot, guestIp };
}

export type ProxmoxClient = ReturnType<typeof createProxmoxClient>;
