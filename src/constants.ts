import type { ServiceId } from "@/types/service";

export const APP_NAME = "Homelab";

/** Keys for @capacitor/preferences (secrets) and localStorage (theme). */
export const STORAGE_KEYS = {
  theme: "homelab_theme",
  /** API keys are stored per service: `homelab_apikey_<serviceId>`. */
  apiKeyPrefix: "homelab_apikey_",
} as const;

export type ThemeMode = "auto" | "light" | "dark";

export interface ServiceMeta {
  id: ServiceId;
  name: string;
  desc: string;
  defaultSubdomain: string;
  /** Whether this module is implemented yet (others show "À venir"). */
  available: boolean;
}

export const SERVICES: ServiceMeta[] = [
  { id: "radarr", name: "Radarr", desc: "Films", defaultSubdomain: "radarr", available: true },
  { id: "sonarr", name: "Sonarr", desc: "Séries", defaultSubdomain: "sonarr", available: true },
  { id: "qbittorrent", name: "qBittorrent", desc: "Torrents", defaultSubdomain: "qbittorrent", available: false },
  { id: "glances", name: "Glances", desc: "Stats serveur", defaultSubdomain: "glances", available: false },
];
