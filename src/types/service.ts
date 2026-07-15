export type ServiceId = "radarr" | "sonarr" | "qbittorrent" | "glances" | "jellyfin" | "plex";

export type ServiceStatus = "idle" | "testing" | "ok" | "error";

/**
 * How the app obtains and sends credentials for a service.
 * - apikey       : user pastes a key, sent as X-Api-Key (*arr)
 * - userpass     : username + password login (qBittorrent, direct)
 * - proxyurl     : the URL itself carries the key (qBittorrent via qui)
 * - quickconnect : Jellyfin Quick Connect — the app asks for a code, the user
 *                  approves it from an already-signed-in Jellyfin session
 * - plexauth     : Plex PIN flow on plex.tv, then the server is auto-discovered
 * - none         : open API (Glances)
 */
export type AuthType = "apikey" | "userpass" | "proxyurl" | "quickconnect" | "plexauth" | "none";

/** Per-service configuration held in the connection store. */
export interface ServiceState {
  /** Sub-domain only, e.g. "radarr" (combined with the root domain). */
  subdomain: string;
  /**
   * Full hostname, when this service does not live under the root domain.
   * Set means "ignore subdomain + rootDomain and use this" — the root domain is
   * only ever a convenience default, never a constraint.
   */
  host?: string;
  /**
   * Absolute base URL, when the address is discovered rather than derived from
   * the root domain (Plex: plex.tv hands it over after sign-in).
   */
  baseUrl?: string;
  /**
   * Which of the service's supported auth methods the user picked. Only set for
   * services offering a choice (qBittorrent: qui proxy or direct login);
   * otherwise the service's single authType applies.
   */
  authType?: AuthType;
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
