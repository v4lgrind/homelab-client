import type { ServiceId } from "@/types/service";

export const APP_NAME = "Homelab";

/** Keys for @capacitor/preferences (secrets) and localStorage (theme). */
export const STORAGE_KEYS = {
  theme: "homelab_theme",
  /** API keys are stored per service: `homelab_apikey_<serviceId>`. */
  apiKeyPrefix: "homelab_apikey_",
} as const;

export type ThemeMode = "auto" | "light" | "dark";

/**
 * How the app obtains and sends credentials for a service.
 * - apikey       : user pastes a key, sent as X-Api-Key (*arr)
 * - proxyurl     : the URL itself carries the key (qBittorrent via qui)
 * - quickconnect : Jellyfin Quick Connect — the app asks for a code, the user
 *                  approves it from an already-signed-in Jellyfin session
 * - plexauth     : Plex PIN flow on plex.tv, then the server is auto-discovered
 * - none         : open API (Glances)
 */
export type AuthType = "apikey" | "userpass" | "proxyurl" | "quickconnect" | "plexauth" | "none";

export interface ServiceMeta {
  id: ServiceId;
  name: string;
  desc: string;
  defaultSubdomain: string;
  /** How the app authenticates to this service. */
  authType: AuthType;
  /** Whether this module is implemented yet (others show "À venir"). */
  available: boolean;
}

export const SERVICES: ServiceMeta[] = [
  { id: "radarr", name: "Radarr", desc: "Films", defaultSubdomain: "radarr", authType: "apikey", available: true },
  { id: "sonarr", name: "Sonarr", desc: "Séries", defaultSubdomain: "sonarr", authType: "apikey", available: true },
  { id: "qbittorrent", name: "qBittorrent", desc: "Torrents", defaultSubdomain: "qui", authType: "proxyurl", available: true },
  { id: "glances", name: "Glances", desc: "Stats serveur", defaultSubdomain: "glances", authType: "none", available: true },
  { id: "jellyfin", name: "Jellyfin", desc: "Serveur média", defaultSubdomain: "jellyfin", authType: "quickconnect", available: true },
  // Plex needs no subdomain: plex.tv hands us the server address after sign-in.
  { id: "plex", name: "Plex", desc: "Serveur média", defaultSubdomain: "", authType: "plexauth", available: true },
];

/** Identifies this app to Jellyfin/Plex. Jellyfin rejects Quick Connect without it. */
export const CLIENT_INFO = {
  name: APP_NAME,
  version: "1.0.0",
  device: "Android",
} as const;
