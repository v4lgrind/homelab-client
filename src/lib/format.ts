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

/** Minutes → "2h 46" / "48 min". */
export function formatRuntime(min?: number): string | undefined {
  if (!min || min <= 0) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m.toString().padStart(2, "0")}` : ""}` : `${m} min`;
}
