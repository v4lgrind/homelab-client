import type { AuthType, ServiceId } from "@/types/service";

export type { AuthType };

export const APP_NAME = "Homelab";

/** Keys for @capacitor/preferences (secrets) and localStorage (theme). */
export const STORAGE_KEYS = {
  theme: "homelab_theme",
  /** API keys are stored per service: `homelab_apikey_<serviceId>`. */
  apiKeyPrefix: "homelab_apikey_",
  /**
   * Passwords for userpass services: `homelab_password_<serviceId>`. Kept apart
   * from apiKeyPrefix so a service offering both auth methods (qBittorrent) does
   * not lose one set of credentials when the user tries the other.
   */
  passwordPrefix: "homelab_password_",
  /**
   * Plex needs two secrets: the account token (under apiKeyPrefix, used to talk
   * to plex.tv and re-discover servers) and this server-scoped token, which is
   * what the media server itself accepts.
   */
  plexServerToken: "homelab_plex_server_token",
} as const;

export type ThemeMode = "auto" | "light" | "dark";

export interface ServiceMeta {
  id: ServiceId;
  name: string;
  desc: string;
  defaultSubdomain: string;
  /** How the app authenticates to this service, unless the user picks another. */
  authType: AuthType;
  /**
   * Every auth method this service supports, when there is a choice to offer.
   * Omitted means authType is the only option.
   */
  authTypes?: AuthType[];
  /** Whether this module is implemented yet (others show "À venir"). */
  available: boolean;
}

/** Labels for the auth picker, kept short enough for a segmented control. */
export const AUTH_LABELS: Partial<Record<AuthType, string>> = {
  proxyurl: "Via qui",
  userpass: "Direct",
};

export const SERVICES: ServiceMeta[] = [
  { id: "radarr", name: "Radarr", desc: "Films", defaultSubdomain: "radarr", authType: "apikey", available: true },
  { id: "sonarr", name: "Sonarr", desc: "Séries", defaultSubdomain: "sonarr", authType: "apikey", available: true },
  // Defaults to qui's proxy, but works against a plain qBittorrent too.
  {
    id: "qbittorrent",
    name: "qBittorrent",
    desc: "Torrents",
    defaultSubdomain: "qbittorrent",
    authType: "proxyurl",
    authTypes: ["proxyurl", "userpass"],
    available: true,
  },
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
