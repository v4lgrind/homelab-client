/** Ring gauges and sparklines shared by the Glances and Proxmox panels. */

/** Circumference for the r=50 ring. */
export const RING = 2 * Math.PI * 50;

export function threshColor(pct: number): string {
  return pct >= 90 ? "var(--danger)" : pct >= 70 ? "var(--warn)" : "var(--accent)";
}

export function dashOffset(pct: number): string {
  return (RING * (1 - Math.min(100, Math.max(0, pct)) / 100)).toFixed(1);
}

export function sparkPoints(vals: number[], w = 120, h = 26): string {
  if (!vals.length) return "";
  const pad = 2;
  const H = h - pad * 2;
  if (vals.length === 1) {
    const y = (pad + H - (Math.min(100, vals[0]) / 100) * H).toFixed(1);
    return `0,${y} ${w},${y}`;
  }
  const step = w / (vals.length - 1);
  return vals
    .map((v, i) => `${(i * step).toFixed(1)},${(pad + H - (Math.min(100, v) / 100) * H).toFixed(1)}`)
    .join(" ");
}

export function percent(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0;
}
