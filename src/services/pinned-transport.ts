import { Capacitor } from "@capacitor/core";
import { CertMismatchError, capacitorTransport, type HttpTransport } from "@/services/http";

/**
 * Transport for a self-signed service on the LAN (Proxmox): the native
 * PinnedHttp plugin, with the certificate fingerprint pinned on first contact.
 *
 * - `getPin` returns the remembered fingerprint, or undefined before the first
 *   contact.
 * - `onFirstSeen` receives the fingerprint the first time one is seen.
 *
 * In the browser (dev) the Vite proxy handles TLS, so CapacitorHttp is used.
 */
export function createPinnedTransport(
  getPin: () => string | undefined,
  onFirstSeen: (fingerprint: string) => void,
): HttpTransport {
  if (!Capacitor.isNativePlatform()) return capacitorTransport;

  return async (req) => {
    const pin = getPin() || undefined;
    // Loaded on first use: the plugin registers itself with the native bridge,
    // which nothing outside a Proxmox request needs.
    const { PinnedHttp } = await import("@/plugins/pinned-http");
    let res;
    try {
      res = await PinnedHttp.request({
        url: req.url,
        method: req.method,
        headers: req.headers,
        data:
          req.data === undefined ? undefined : typeof req.data === "string" ? req.data : JSON.stringify(req.data),
        timeoutMs: req.timeoutMs,
        pin,
      });
    } catch (e) {
      const err = e as { code?: string; data?: { fingerprint?: string } };
      if (err?.code === "cert_mismatch" && err.data?.fingerprint) {
        throw new CertMismatchError(err.data.fingerprint);
      }
      throw e;
    }
    if (!pin && res.fingerprint) onFirstSeen(res.fingerprint);

    let data: unknown = null;
    if (res.data) {
      try {
        data = JSON.parse(res.data);
      } catch {
        data = res.data;
      }
    }
    return { status: res.status, headers: res.headers ?? {}, data };
  };
}
