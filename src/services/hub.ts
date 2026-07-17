import { Capacitor } from "@capacitor/core";
import { ServiceHttp } from "@/services/http";
import type { HubNotification } from "@/types/notification";

/**
 * Base URL for the notifications hub. On device, CapacitorHttp talks to the
 * user's hub domain directly. In the browser, go through the Vite proxy
 * (/proxy-hub → DEV_HUB_URL) to stay same-origin and dodge CORS.
 */
function hubBase(hubUrl: string): string {
  return Capacitor.isNativePlatform()
    ? hubUrl.replace(/\/+$/, "")
    : window.location.origin + "/proxy-hub";
}

/**
 * URL for the SSE stream. EventSource cannot set headers, so the bearer goes in
 * the query string. Works through the dev proxy in the browser and direct
 * (CORS-enabled) on device.
 */
export function hubStreamUrl(hubUrl: string, token: string): string {
  return `${hubBase(hubUrl)}/api/stream?token=${encodeURIComponent(token)}`;
}

/**
 * Client for the hub. The app authenticates with a bearer token, so ServiceHttp
 * carries it as the Authorization header rather than X-Api-Key.
 */
export function createHubClient(hubUrl: string, token: string) {
  const http = new ServiceHttp(hubBase(hubUrl), token ? `Bearer ${token}` : "", "Authorization");

  return {
    /** Liveness check; the health endpoint needs no token. */
    ping: () => http.get<{ ok: boolean }>("/api/health"),

    /** Newest notifications; `sinceId` fetches only those newer than one held. */
    getNotifications: (sinceId?: number) =>
      http.get<{ notifications: HubNotification[] }>("/api/notifications", {
        params: sinceId != null ? { since: sinceId } : undefined,
      }),
  };
}

export type HubClient = ReturnType<typeof createHubClient>;
