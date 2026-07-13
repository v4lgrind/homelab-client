import type { ServiceId } from "@/types/service";

export const APP_NAME = "Homelab";

/** Keys for @capacitor/preferences (secrets) and localStorage (theme). */
export const STORAGE_KEYS = {
  theme: "homelab_theme",
  /** API keys are stored per service: `homelab_apikey_<serviceId>`. */
  apiKeyPrefix: "homelab_apikey_",
} as const;

export type ThemeMode = "auto" | "light" | "dark";

export type AuthType = "apikey" | "userpass" | "proxyurl" | "none";

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
];
