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
  /**
   * Last add choices, remembered per kind so the add sheet defaults to what the
   * user last picked (e.g. /tvshows) rather than the first folder the API lists
   * (which could be /anime). Not a secret, but kept with the rest of the app's
   * localStorage-backed keys. Suffixed with "movie" / "series".
   */
  addDefaultsPrefix: "homelab_add_defaults_",
  /** Bearer token the app presents to the notifications hub. */
  hubToken: "homelab_hub_token",
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
  /** Overrides AUTH_LABELS where a service names a method its own way. */
  authLabels?: Partial<Record<AuthType, string>>;
  /** Whether this module is implemented yet (others show "À venir"). */
  available: boolean;
}

/** Labels for the auth picker, kept short enough for a segmented control. */
export const AUTH_LABELS: Partial<Record<AuthType, string>> = {
  proxyurl: "Via qui",
  userpass: "Identifiants",
  quickconnect: "Quick Connect",
  apikey: "Clé API",
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
    // "Direct" reads better than "Identifiants" next to "Via qui": here the
    // distinction the user cares about is the route, not the credential.
    authLabels: { userpass: "Direct" },
    available: true,
  },
  { id: "glances", name: "Glances", desc: "Stats serveur", defaultSubdomain: "glances", authType: "none", available: true },
  {
    id: "jellyfin",
    name: "Jellyfin",
    desc: "Serveur média",
    defaultSubdomain: "jellyfin",
    authType: "quickconnect",
    authTypes: ["quickconnect", "userpass"],
    available: true,
  },
  // Plex needs no subdomain: plex.tv hands us the server address after sign-in.
  { id: "plex", name: "Plex", desc: "Serveur média", defaultSubdomain: "", authType: "plexauth", available: true },
];

/** Identifies this app to Jellyfin/Plex. Jellyfin rejects Quick Connect without it. */
export const CLIENT_INFO = {
  name: APP_NAME,
  version: "1.0.0",
  device: "Android",
} as const;
