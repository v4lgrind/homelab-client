/** Bytes → human size, e.g. 18400000000 → "17.1 Go". */
export function formatSize(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Bytes/sec → "12.4 Mo/s". */
export function formatRate(bytesPerSec?: number): string {
  const b = bytesPerSec ?? 0;
  const units = ["o/s", "Ko/s", "Mo/s", "Go/s"];
  let v = b;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Release age (days and/or minutes) → "3 j" / "5 h" / "2 mois". */
export function formatAge(days?: number, minutes?: number): string | undefined {
  const m = minutes ?? (days != null ? days * 1440 : undefined);
  if (m == null) return undefined;
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  const d = m / 1440;
  if (d < 30) return `${Math.round(d)} j`;
  if (d < 365) return `${Math.round(d / 30)} mois`;
  return `${(d / 365).toFixed(1)} an`;
}

/** *arr timeleft ("HH:MM:SS" or "D.HH:MM:SS") → "4 min" / "1h20" / "2 j". */
export function formatEta(timeleft?: string): string | undefined {
  if (!timeleft) return undefined;
  let days = 0;
  let rest = timeleft;
  const dot = timeleft.indexOf(".");
  const colon = timeleft.indexOf(":");
  if (dot !== -1 && dot < colon) {
    days = parseInt(timeleft.slice(0, dot), 10) || 0;
    rest = timeleft.slice(dot + 1);
  }
  const [h = 0, m = 0] = rest.split(":").map((n) => parseInt(n, 10) || 0);
  const totalMin = days * 1440 + h * 60 + m;
  if (totalMin <= 0) return undefined;
  if (totalMin < 60) return `${totalMin} min`;
  if (totalMin < 1440) return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`;
  return `${Math.floor(totalMin / 1440)} j`;
}

/** Seconds → "4 min" / "1h20" / "2 j". qBittorrent uses 8640000 for infinity. */
export function formatDuration(seconds?: number): string | undefined {
  if (seconds == null || seconds < 0 || seconds >= 8640000) return undefined;
  const m = Math.round(seconds / 60);
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 1440)} j`;
}

/** Bytes/s → "12.4 Mo/s". */
export function formatSpeed(bytesPerSec?: number): string {
  const s = formatSize(bytesPerSec);
  return s ? `${s}/s` : "0 o/s";
}

/** Start-of-day for a timestamp, for grouping notifications by calendar day. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Stable per-day key, e.g. "2026-07-16", for grouping. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Human day heading: "Aujourd'hui" / "Hier" / "12 juillet". */
export function dayLabel(ts: number): string {
  const today = startOfDay(new Date());
  const day = startOfDay(new Date(ts));
  const dayMs = 86400000;
  if (day === today) return "Aujourd'hui";
  if (day === today - dayMs) return "Hier";
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

/** Compact time for a notification: relative under a day, clock beyond. */
export function timeShort(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return "à l'instant";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && startOfDay(new Date(ts)) === startOfDay(new Date())) return `${h} h`;
  return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** Playback position in ms → "48:12" / "2:06:30" (hours only when needed). */
export function formatClock(ms?: number): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Stream bitrate in kbps → "4.2 Mb/s" / "850 kb/s". */
export function formatBitrate(kbps?: number): string | undefined {
  if (!kbps || kbps <= 0) return undefined;
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mb/s` : `${Math.round(kbps)} kb/s`;
}

/** Minutes → "2h 46" / "48 min". */
export function formatRuntime(min?: number): string | undefined {
  if (!min || min <= 0) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m.toString().padStart(2, "0")}` : ""}` : `${m} min`;
}
