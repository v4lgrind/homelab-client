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
};

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "auth" | "notfound" | "network" | "server" | "unknown",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Build the base URL for a service given the user's root domain + subdomain. */
export function serviceBaseUrl(id: ServiceId, subdomain: string, rootDomain: string): string {
  if (Capacitor.isNativePlatform()) {
    return `https://${subdomain}.${rootDomain}`;
  }
  const proxy = DEV_PROXY[id];
  if (proxy) return window.location.origin + proxy;
  // No dev proxy configured for this service → will likely hit CORS in the
  // browser, but works once running on device.
  return `https://${subdomain}.${rootDomain}`;
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

/**
 * Thin HTTP client scoped to one service. Injects the API key on every
 * request and normalises errors into {@link HttpError}.
 */
export class ServiceHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
    const url = buildUrl(this.baseUrl, path, opts.params);
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      Accept: "application/json",
      ...(opts.data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    };

    let res;
    try {
      res = await CapacitorHttp.request({
        url,
        method: opts.method ?? "GET",
        headers,
        data: opts.data,
        connectTimeout: opts.timeoutMs ?? 12000,
        readTimeout: opts.timeoutMs ?? 12000,
      });
    } catch (e) {
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
