/** The Proxmox node, normalised from /nodes/{node}/status. */
export interface PveNode {
  node: string;
  /** Percent, 0–100. */
  cpu: number;
  cores?: number;
  memUsed: number;
  memTotal: number;
  swapPercent?: number;
  load1?: number;
  /** Seconds. */
  uptime: number;
  /** e.g. "8.3.2". */
  version?: string;
}

/** A VM (qemu) or container (lxc), from /cluster/resources. */
export interface PveGuest {
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  running: boolean;
  /** Percent of the guest's own cores, 0–100. */
  cpu: number;
  cores: number;
  memUsed: number;
  memTotal: number;
  /** Bytes used; undefined for a VM (Proxmox only knows it through the agent). */
  diskUsed?: number;
  diskTotal: number;
  /** Cumulative byte counters; rates are derived between two snapshots. */
  netIn: number;
  netOut: number;
  /** Seconds. */
  uptime: number;
  tags: string[];
  template: boolean;
}

export interface PveStorage {
  id: string;
  type: string;
  used: number;
  total: number;
  percent: number;
}

export interface PveSnapshot {
  node: PveNode;
  guests: PveGuest[];
  storages: PveStorage[];
}
