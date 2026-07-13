import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { HttpError } from "@/services/http";
import type { AddTorrentOptions, QbitTorrentRaw, QbitTransfer } from "@/types/qbittorrent";

type Form = Record<string, string | number | boolean | undefined>;

function encodeForm(form: Form): string {
  return Object.entries(form)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/**
 * qBittorrent Web API (v2) client — reached through the qui "Client Proxy":
 * the proxy URL embeds the API key and qui maintains the qBittorrent session,
 * so there is no login step and endpoints (`/api/v2/...`) are appended to it.
 * Bodies are form-urlencoded, not JSON.
 */
export function createQbitClient(proxyUrl: string) {
  // On device: hit the qui proxy URL directly. In dev: go through the Vite
  // proxy (/proxy-qbittorrent → DEV_QBITTORRENT_URL) to dodge CORS.
  const base = Capacitor.isNativePlatform()
    ? proxyUrl.replace(/\/+$/, "")
    : window.location.origin + "/proxy-qbittorrent";

  async function req<T>(
    path: string,
    opts: { method?: "GET" | "POST"; form?: Form; timeoutMs?: number } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    let data: string | undefined;
    if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      data = encodeForm(opts.form);
    }
    let res;
    try {
      res = await CapacitorHttp.request({
        url: base + path,
        method: opts.method ?? "GET",
        headers,
        data,
        connectTimeout: opts.timeoutMs ?? 15000,
        readTimeout: opts.timeoutMs ?? 15000,
      });
    } catch (e) {
      throw new HttpError(`Service injoignable (${(e as Error)?.message ?? "réseau"})`, 0, "network");
    }
    const status = res.status;
    if (status === 401 || status === 403) throw new HttpError("Proxy qui refusé (clé invalide ?)", status, "auth");
    if (status === 404) throw new HttpError("Endpoint introuvable", 404, "notfound");
    if (status < 200 || status >= 300) {
      throw new HttpError(`Erreur ${status}`, status, status >= 500 ? "server" : "unknown");
    }
    return res.data as T;
  }

  /** POST an action, trying the v5 endpoint then falling back to the v4 name. */
  async function action(primary: string, fallback: string, form: Form) {
    try {
      await req(`/api/v2/torrents/${primary}`, { method: "POST", form });
    } catch (e) {
      if (e instanceof HttpError && (e.kind === "notfound" || e.status === 404)) {
        await req(`/api/v2/torrents/${fallback}`, { method: "POST", form });
      } else {
        throw e;
      }
    }
  }

  return {
    base,
    getAppVersion: () => req<string>("/api/v2/app/version"),
    getTorrents: () => req<QbitTorrentRaw[]>("/api/v2/torrents/info"),
    getTransferInfo: () => req<QbitTransfer>("/api/v2/transfer/info"),
    getCategories: () => req<Record<string, { name: string }>>("/api/v2/torrents/categories"),

    // v5 renamed pause→stop / resume→start; try new name then old.
    pause: (hashes: string) => action("stop", "pause", { hashes }),
    resume: (hashes: string) => action("start", "resume", { hashes }),
    forceResume: (hashes: string) =>
      req("/api/v2/torrents/setForceStart", { method: "POST", form: { hashes, value: true } }),
    remove: (hashes: string, deleteFiles: boolean) =>
      req("/api/v2/torrents/delete", { method: "POST", form: { hashes, deleteFiles } }),
    setCategory: (hashes: string, category: string) =>
      req("/api/v2/torrents/setCategory", { method: "POST", form: { hashes, category } }),
    addUrls: (urls: string, opts: AddTorrentOptions = {}) =>
      req("/api/v2/torrents/add", {
        method: "POST",
        form: {
          urls,
          category: opts.category || undefined,
          paused: opts.paused ? "true" : undefined,
          stopped: opts.paused ? "true" : undefined,
        },
      }),
  };
}

export type QbitClient = ReturnType<typeof createQbitClient>;
