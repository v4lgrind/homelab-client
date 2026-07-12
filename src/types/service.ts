export type ServiceId = "radarr" | "sonarr" | "qbittorrent" | "glances";

export type ServiceStatus = "idle" | "testing" | "ok" | "error";

/** Per-service configuration held in the connection store. */
export interface ServiceState {
  /** Sub-domain only, e.g. "radarr" (combined with the root domain). */
  subdomain: string;
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
