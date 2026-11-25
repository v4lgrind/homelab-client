import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { ServiceId } from "@/types/service";

/**
 * In dev (browser), route through the Vite proxy paths declared in
 * vite.config.ts so requests stay same-origin (dodges CORS). On device,
 * CapacitorHttp hits the real HTTPS domains directly.
 */
const DEV_PROXY: Partial<Record<ServiceId, string>> = {
  radarr: "/proxy-radarr",
  sonarr: "/proxy-sonarr",
  glances: "/proxy-glances",
  jellyfin: "/proxy-jellyfin",
  qbittorrent: "/proxy-qbittorrent",
  proxmox: "/proxy-proxmox",
};

/**
 * "gate": the reverse proxy's auth layer (tinyauth) refused the request before
 * it reached the service — the address is a public, tinyauth-protected domain
 * rather than the LAN / VPN one. The key is not the problem.
 */
export type HttpErrorKind = "auth" | "gate" | "notfound" | "network" | "server" | "cert" | "unknown";

export class HttpError extends Error {
  // Declared explicitly rather than as constructor parameter properties, which
  // erasableSyntaxOnly forbids.
  readonly status: number;
  readonly kind: HttpErrorKind;

  constructor(
    message: string,
    status: number,
    kind: HttpErrorKind,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.kind = kind;
  }
}

/**
 * The server presented a certificate other than the pinned one (Proxmox, see
 * pinned-transport.ts). Nothing was sent to it.
 */
export class CertMismatchError extends HttpError {
  readonly received: string;

  constructor(received: string) {
    super("Certificat changé", 0, "cert");
    this.name = "CertMismatchError";
    this.received = received;
  }
}

/**
 * Tinyauth tags the 401s it emits itself with x-tinyauth-location (the login
 * URL). Returns a "gate" error for those, undefined for anything else.
 */
export function authGateError(
  status: number,
  headers: Record<string, string> | undefined,
): HttpError | undefined {
  if (status !== 401 && status !== 403) return undefined;
  const gated = Object.keys(headers ?? {}).some((k) => k.toLowerCase() === "x-tinyauth-location");
  if (!gated) return undefined;
  return new HttpError(
    "Bloqué par tinyauth — VPN connecté ?",
    status,
    "gate",
  );
}

/**
 * Base URL for a service, from its full normalised address (the connection
 * store's `urlOf`): `https://radarr.example.com`, or a plain-HTTP LAN / VPN
 * address such as `http://192.168.1.10:7878` that skips the reverse proxy.
 */
export function serviceBaseUrl(id: ServiceId, url: string): string {
  if (Capacitor.isNativePlatform()) return url;
  const proxy = DEV_PROXY[id];
  if (proxy) return window.location.origin + proxy;
  // No dev proxy configured for this service → will likely hit CORS in the
  // browser, but works once running on device.
  return url;
}

export interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
  /** Request timeout in ms (default 12000). */
  timeoutMs?: number;
}

function buildUrl(base: string, path: string, params?: RequestOpts["params"]): string {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

export interface TransportRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: unknown;
  timeoutMs: number;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

/** Sends one request. Throws {@link HttpError} itself only for errors it alone
 *  can name (a changed certificate); any other throw becomes "network". */
export type HttpTransport = (req: TransportRequest) => Promise<TransportResponse>;

/** The default: CapacitorHttp, which dodges CORS on device. */
export const capacitorTransport: HttpTransport = (req) =>
  CapacitorHttp.request({
    url: req.url,
    method: req.method,
    headers: req.headers,
    data: req.data,
    connectTimeout: req.timeoutMs,
    readTimeout: req.timeoutMs,
  });

/**
 * Thin HTTP client scoped to one service. Injects the API key on every
 * request and normalises errors into {@link HttpError}.
 *
 * The header carrying the key differs per vendor: *arr use X-Api-Key, Plex
 * X-Plex-Token — hence authHeader. Jellyfin passes its token in its own
 * Authorization header instead.
 */
export class ServiceHttp {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly authHeader: string;
  private readonly transport: HttpTransport;

  constructor(
    baseUrl: string,
    apiKey: string,
    authHeader = "X-Api-Key",
    transport: HttpTransport = capacitorTransport,
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.authHeader = authHeader;
    this.transport = transport;
  }

  async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = buildUrl(this.baseUrl, path, opts.params);
    const headers: Record<string, string> = {
      // Omit the header entirely when we have no key: plex.tv rejects an empty
      // X-Plex-Token, and the PIN flow runs before any token exists.
      ...(this.apiKey ? { [this.authHeader]: this.apiKey } : {}),
      Accept: "application/json",
      ...(opts.data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    };

    let res;
    try {
      res = await this.transport({
        url,
        method: opts.method ?? "GET",
        headers,
        data: opts.data,
        timeoutMs: opts.timeoutMs ?? 12000,
      });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(
        `Service injoignable (${(e as Error)?.message ?? "erreur réseau"})`,
        0,
        "network",
      );
    }

    const status = res.status;
    if (status >= 200 && status < 300) {
      return res.data as T;
    }
    const gate = authGateError(status, res.headers);
    if (gate) throw gate;
    if (status === 401 || status === 403) {
      throw new HttpError("Clé API invalide ou refusée", status, "auth");
    }
    if (status === 404) {
      throw new HttpError("Endpoint introuvable — vérifie l'URL du service", status, "notfound");
    }
    if (status === 0) {
      throw new HttpError("Service injoignable", status, "network");
    }
    throw new HttpError(`Erreur ${status}`, status, status >= 500 ? "server" : "unknown");
  }

  get<T>(path: string, opts?: Omit<RequestOpts, "method" | "data">) {
    return this.request<T>(path, { ...opts, method: "GET" });
  }
  post<T>(path: string, data?: unknown, opts?: Omit<RequestOpts, "method">) {
    return this.request<T>(path, { ...opts, method: "POST", data });
  }
  put<T>(path: string, data?: unknown, opts?: Omit<RequestOpts, "method">) {
    return this.request<T>(path, { ...opts, method: "PUT", data });
  }
  del<T>(path: string, opts?: Omit<RequestOpts, "method">) {
    return this.request<T>(path, { ...opts, method: "DELETE" });
  }
}
