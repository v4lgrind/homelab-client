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
 * Two ways to reach qBittorrent:
 * - proxy: qui's Client Proxy. The URL embeds the API key and qui keeps the
 *   qBittorrent session, so there is no login step.
 * - direct: qBittorrent's own Web API, which needs a username/password login
 *   that returns an SID cookie.
 */
export type QbitConfig =
  | { mode: "proxy"; proxyUrl: string }
  | { mode: "direct"; subdomain: string; rootDomain: string; username: string; password: string };

function baseUrlFor(cfg: QbitConfig): string {
  if (cfg.mode === "proxy") {
    // On device: hit the qui proxy URL directly. In dev: go through the Vite
    // proxy (/proxy-qbittorrent → DEV_QBITTORRENT_URL) to dodge CORS.
    return Capacitor.isNativePlatform()
      ? cfg.proxyUrl.replace(/\/+$/, "")
      : window.location.origin + "/proxy-qbittorrent";
  }
  return Capacitor.isNativePlatform()
    ? `https://${cfg.subdomain}.${cfg.rootDomain}`
    : window.location.origin + "/proxy-qbittorrent-direct";
}

/** Pull the session id out of Set-Cookie; header casing varies by platform. */
function extractSid(headers: Record<string, string> | undefined): string | undefined {
  if (!headers) return undefined;
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "set-cookie")?.[1];
  return raw ? /SID=([^;]+)/.exec(raw)?.[1] : undefined;
}

/**
 * qBittorrent Web API (v2) client. Bodies are form-urlencoded, not JSON.
 */
export function createQbitClient(cfg: QbitConfig) {
  const base = baseUrlFor(cfg);
  const native = Capacitor.isNativePlatform();
  let sid: string | undefined;
  // Tracked separately from `sid`: in the browser the SID lands in a cookie we
  // are not allowed to read, so a successful login is all we can observe.
  let loggedIn = false;

  async function raw(
    path: string,
    opts: { method?: "GET" | "POST"; form?: Form; timeoutMs?: number } = {},
  ) {
    const headers: Record<string, string> = {};
    let data: string | undefined;
    if (opts.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      data = encodeForm(opts.form);
    }
    // The browser owns the Cookie header and forbids setting it from JS; in dev
    // it replays the SID itself since the Vite proxy keeps us same-origin.
    if (native && sid) headers["Cookie"] = `SID=${sid}`;

    try {
      return await CapacitorHttp.request({
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
  }

  async function login(): Promise<void> {
    if (cfg.mode !== "direct") return;
    const res = await raw("/api/v2/auth/login", {
      method: "POST",
      form: { username: cfg.username, password: cfg.password },
    });
    // qBittorrent answers 200 with the body "Fails." on bad credentials, and
    // 403 when it has banned the IP after too many attempts.
    if (res.status === 403) {
      throw new HttpError("Trop de tentatives — qBittorrent a banni l'IP temporairement", 403, "auth");
    }
    if (typeof res.data === "string" && res.data.trim().startsWith("Fails")) {
      throw new HttpError("Identifiants qBittorrent refusés", 401, "auth");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new HttpError(`Échec du login (${res.status})`, res.status, "auth");
    }
    sid = extractSid(res.headers as Record<string, string>);
    loggedIn = true;
  }

  async function req<T>(
    path: string,
    opts: { method?: "GET" | "POST"; form?: Form; timeoutMs?: number } = {},
  ): Promise<T> {
    if (cfg.mode === "direct" && !loggedIn) await login();

    let res = await raw(path, opts);
    // A direct session expires server-side; log back in once and retry rather
    // than surfacing a spurious auth error.
    if (res.status === 403 && cfg.mode === "direct") {
      loggedIn = false;
      sid = undefined;
      await login();
      res = await raw(path, opts);
    }

    const status = res.status;
    if (status === 401 || status === 403) {
      throw new HttpError(
        cfg.mode === "proxy" ? "Proxy qui refusé (clé invalide ?)" : "Identifiants qBittorrent refusés",
        status,
        "auth",
      );
    }
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
    login,
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
