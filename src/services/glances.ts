import { ServiceHttp, serviceBaseUrl, HttpError } from "@/services/http";
import type { DiskStat, GlancesAll, GlancesStats, NetStat, TempStat } from "@/types/glances";

function normalize(a: GlancesAll): GlancesStats {
  // Glances (esp. in Docker) reports the same filesystem under many bind mounts.
  // Dedupe by device (falling back to a size signature), keeping the shortest
  // mount path as the representative.
  const seen = new Map<string, DiskStat>();
  for (const f of a.fs ?? []) {
    if ((f.size ?? 0) <= 0) continue;
    const disk: DiskStat = {
      mount: f.mnt_point ?? f.device_name ?? "?",
      fstype: f.fs_type,
      used: f.used ?? 0,
      total: f.size ?? 0,
      percent: Math.round(f.percent ?? 0),
    };
    const key = f.device_name || `${disk.used}|${disk.total}`;
    const prev = seen.get(key);
    if (!prev || disk.mount.length < prev.mount.length) seen.set(key, disk);
  }
  const disks: DiskStat[] = [...seen.values()].sort((x, y) => y.total - x.total);

  const net: NetStat[] = (a.network ?? [])
    .filter((n) => (n.interface_name ?? "") !== "lo" && n.is_up !== false)
    .map((n) => ({
      iface: n.interface_name ?? "?",
      rx: n.bytes_recv_rate_per_sec ?? 0,
      tx: n.bytes_sent_rate_per_sec ?? 0,
    }))
    .sort((x, y) => y.rx + y.tx - (x.rx + x.tx));

  const temps: TempStat[] = (a.sensors ?? [])
    .filter(
      (s) =>
        typeof s.value === "number" &&
        (s.unit === "C" || s.unit === "°C" || (s.type ?? "").includes("temperature")),
    )
    .map((s) => ({ label: s.label ?? "?", value: Math.round(s.value!), unit: "°C" }));

  return {
    hostname: a.system?.hostname,
    os:
      a.system?.hr_name ||
      [a.system?.os_name, a.system?.os_version].filter(Boolean).join(" ") ||
      undefined,
    uptime: a.uptime,
    cpu: Math.round(a.cpu?.total ?? 0),
    cpuCores: a.load?.cpucore ?? a.core?.log,
    memPercent: Math.round(a.mem?.percent ?? 0),
    memUsed: a.mem?.used,
    memTotal: a.mem?.total,
    swapPercent: a.memswap?.percent != null ? Math.round(a.memswap.percent) : undefined,
    load1: a.load?.min1,
    load5: a.load?.min5,
    load15: a.load?.min15,
    procs: a.processcount?.total,
    disks,
    net,
    temps,
  };
}

export function createGlancesClient(subdomain: string, rootDomain: string) {
  const base = serviceBaseUrl("glances", subdomain, rootDomain);
  const http = new ServiceHttp(base, ""); // Glances API is bypassed — no key
  let apiVer = 4;

  async function getAll(): Promise<GlancesAll> {
    try {
      return await http.get<GlancesAll>(`/api/${apiVer}/all`);
    } catch (e) {
      // Fall back to the v3 API if v4 isn't available.
      if (apiVer === 4 && e instanceof HttpError && e.kind === "notfound") {
        apiVer = 3;
        return http.get<GlancesAll>("/api/3/all");
      }
      throw e;
    }
  }

  return {
    base,
    getAll,
    getStats: async (): Promise<GlancesStats> => normalize(await getAll()),
  };
}

export type GlancesClient = ReturnType<typeof createGlancesClient>;
