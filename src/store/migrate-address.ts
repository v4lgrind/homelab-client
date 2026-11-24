/**
 * One-off migration from the "root domain + subdomain (+ host override)" model
 * to one full address per service. Runs on hydration, so a user updating the
 * app keeps every address, scheme included, without retyping anything.
 */

interface LegacyAddress {
  url?: string;
  subdomain?: string;
  host?: string;
}

export function migrateLegacyAddress(svc: LegacyAddress, rootDomain?: string): string | undefined {
  if (svc.url?.trim()) return svc.url;
  const host = svc.host?.trim();
  if (host) return /^https?:\/\//i.test(host) ? host : `https://${host}`;
  const sub = svc.subdomain?.trim();
  const root = rootDomain?.trim();
  return sub && root ? `https://${sub}.${root}` : undefined;
}

/** Rewrite a freshly hydrated connection state in place. */
export function migrateHydratedState(state: Record<string, unknown>): void {
  const rootDomain = typeof state.rootDomain === "string" ? state.rootDomain : undefined;
  const services = (state.services ?? {}) as Record<string, LegacyAddress & Record<string, unknown>>;
  for (const svc of Object.values(services)) {
    // Runs on every launch: only touch services still in the legacy shape.
    if (!("subdomain" in svc) && !("host" in svc)) continue;
    const url = migrateLegacyAddress(svc, rootDomain);
    if (url) svc.url = url;
    // A persisted "ok" means nothing without an address to reach.
    else svc.status = "idle";
    delete svc.subdomain;
    delete svc.host;
  }
  delete state.rootDomain;
}
