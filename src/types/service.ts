export type ServiceId = "radarr" | "sonarr" | "qbittorrent" | "glances" | "jellyfin" | "plex";

export type ServiceStatus = "idle" | "testing" | "ok" | "error";

/** Per-service configuration held in the connection store. */
export interface ServiceState {
  /** Sub-domain only, e.g. "radarr" (combined with the root domain). */
  subdomain: string;
  /**
   * Absolute base URL, when the address is discovered rather than derived from
   * the root domain (Plex: plex.tv hands it over after sign-in).
   */
  baseUrl?: string;
  /** Username for userpass services (e.g. qBittorrent); non-secret, persisted. */
  username?: string;
  /** Server name reported by the service (Jellyfin/Plex). */
  serverName?: string;
  status: ServiceStatus;
  /** App version reported by the service on a successful test. */
  version?: string;
  /** Optional item count (movies/series), filled by later phases. */
  count?: number;
  /** Human-readable error from the last failed test. */
  error?: string;
}

/** Subset of Radarr/Sonarr `GET /api/v3/system/status`. */
export interface ArrSystemStatus {
  version: string;
  appName?: string;
  instanceName?: string;
}
