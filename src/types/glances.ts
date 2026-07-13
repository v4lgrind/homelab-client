// Raw shape of Glances `GET /api/{3,4}/all` (subset, all optional — field names
// vary slightly across versions, so parsing stays defensive).
export interface GlancesFs {
  device_name?: string;
  fs_type?: string;
  mnt_point?: string;
  size?: number;
  used?: number;
  free?: number;
  percent?: number;
}
export interface GlancesNet {
  interface_name?: string;
  bytes_recv?: number;
  bytes_sent?: number;
  bytes_recv_rate_per_sec?: number;
  bytes_sent_rate_per_sec?: number;
  is_up?: boolean;
}
export interface GlancesSensor {
  label?: string;
  value?: number;
  unit?: string;
  type?: string;
}
export interface GlancesAll {
  cpu?: { total?: number };
  core?: { phys?: number; log?: number };
  mem?: { percent?: number; used?: number; total?: number };
  memswap?: { percent?: number };
  load?: { min1?: number; min5?: number; min15?: number; cpucore?: number };
  processcount?: { total?: number };
  fs?: GlancesFs[];
  network?: GlancesNet[];
  sensors?: GlancesSensor[];
  system?: { hostname?: string; os_name?: string; os_version?: string; hr_name?: string };
  uptime?: string;
}

// Normalised view-model consumed by the dashboard.
export interface DiskStat {
  mount: string;
  fstype?: string;
  used: number;
  total: number;
  percent: number;
}
export interface NetStat {
  iface: string;
  rx: number; // bytes/sec
  tx: number; // bytes/sec
}
export interface TempStat {
  label: string;
  value: number;
  unit: string;
}
export interface GlancesStats {
  hostname?: string;
  os?: string;
  uptime?: string;
  cpu: number;
  cpuCores?: number;
  memPercent: number;
  memUsed?: number;
  memTotal?: number;
  swapPercent?: number;
  load1?: number;
  load5?: number;
  load15?: number;
  procs?: number;
  disks: DiskStat[];
  net: NetStat[];
  temps: TempStat[];
}
