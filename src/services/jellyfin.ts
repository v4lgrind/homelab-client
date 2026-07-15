import { Preferences } from "@capacitor/preferences";
import { ServiceHttp, serviceBaseUrl } from "@/services/http";
import { CLIENT_INFO } from "@/constants";
import type {
  JellyfinAuthResult,
  JellyfinSessionRaw,
  JellyfinSystemInfo,
  QuickConnectState,
} from "@/types/media";

const DEVICE_ID_KEY = "homelab_jellyfin_device_id";

/**
 * Jellyfin ties Quick Connect requests to a device id, and the same id must be
 * used from Initiate through to Authenticate. Generate once, then reuse.
 */
async function deviceId(): Promise<string> {
  const { value } = await Preferences.get({ key: DEVICE_ID_KEY });
  if (value) return value;
  const id = `homelab-${crypto.randomUUID()}`;
  await Preferences.set({ key: DEVICE_ID_KEY, value: id });
  return id;
}

/** Jellyfin refuses Quick Connect (HTTP 400) without this header — verified. */
function authHeader(id: string, token?: string): string {
  const parts = [
    `Client="${CLIENT_INFO.name}"`,
    `Device="${CLIENT_INFO.device}"`,
    `DeviceId="${id}"`,
    `Version="${CLIENT_INFO.version}"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(", ")}`;
}

export function createJellyfinClient(host: string, token = "") {
  const base = serviceBaseUrl("jellyfin", host);
  // Jellyfin accepts the token via X-Emby-Token; the MediaBrowser Authorization
  // header identifies the client and is required on the Quick Connect endpoints.
  const http = new ServiceHttp(base, token, "X-Emby-Token");

  async function clientHeaders(): Promise<Record<string, string>> {
    return { Authorization: authHeader(await deviceId(), token || undefined) };
  }

  return {
    base,

    /** Whether the server has Quick Connect turned on at all. */
    isQuickConnectEnabled: () => http.get<boolean>("/QuickConnect/Enabled"),

    /** Start a Quick Connect request — returns the code the user must approve. */
    async initiateQuickConnect(): Promise<QuickConnectState> {
      return http.request<QuickConnectState>("/QuickConnect/Initiate", {
        method: "POST",
        headers: await clientHeaders(),
      });
    },

    /** Poll until the user approves the code in a signed-in Jellyfin session. */
    async pollQuickConnect(secret: string): Promise<QuickConnectState> {
      return http.request<QuickConnectState>("/QuickConnect/Connect", {
        params: { Secret: secret },
        headers: await clientHeaders(),
      });
    },

    /** Exchange an approved secret for a lasting access token. */
    async authenticateQuickConnect(secret: string): Promise<JellyfinAuthResult> {
      return http.request("/Users/AuthenticateWithQuickConnect", {
        method: "POST",
        data: { Secret: secret },
        headers: await clientHeaders(),
      });
    },

    /**
     * Classic username/password sign-in, for servers with Quick Connect turned
     * off. Yields the same kind of access token, so everything downstream is
     * identical either way.
     */
    async authenticateByName(username: string, password: string): Promise<JellyfinAuthResult> {
      return http.request("/Users/AuthenticateByName", {
        method: "POST",
        data: { Username: username, Pw: password },
        headers: await clientHeaders(),
      });
    },

    getSystemInfo: () => http.get<JellyfinSystemInfo>("/System/Info"),
    /** Active playback sessions. Requires the token to belong to an admin. */
    getSessions: () => http.get<JellyfinSessionRaw[]>("/Sessions", { params: { activeWithinSeconds: 60 } }),

    /**
     * Poster for a session's item, authenticated by the token in the URL.
     * Sized for the card at 3x pixel density — asking for the CSS size alone
     * makes it soft on a phone screen.
     */
    imageUrl: (itemId: string) =>
      `${base}/Items/${itemId}/Images/Primary?maxWidth=210&quality=90&api_key=${encodeURIComponent(token)}`,
  };
}

export type JellyfinClient = ReturnType<typeof createJellyfinClient>;
