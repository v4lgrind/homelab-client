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

/** Minutes → "2h 46" / "48 min". */
export function formatRuntime(min?: number): string | undefined {
  if (!min || min <= 0) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? ` ${m.toString().padStart(2, "0")}` : ""}` : `${m} min`;
}
