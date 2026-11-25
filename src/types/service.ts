export type ServiceId = "radarr" | "sonarr" | "qbittorrent" | "glances" | "jellyfin" | "plex" | "proxmox";

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
  /**
   * The service's address exactly as typed (e.g. "radarr.example.com" or
   * "http://192.168.1.10:7878"). Read it through the store's `urlOf`, which
   * normalises it; it is stored raw because the field writes on every keystroke.
   */
  url?: string;
  /**
   * Absolute base URL, when the address is discovered rather than typed
   * (Plex: plex.tv hands it over after sign-in).
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
  /** Plex: clientIdentifier of the server the user picked (the account may
   *  see several, its own and shared ones). */
  serverId?: string;
  /**
   * Proxmox: SHA-256 of its self-signed certificate ("AB:CD:…"), pinned on
   * first contact. Not a secret, so persisted with the rest of the config.
   */
  certSha256?: string;
  /** Proxmox: the address certSha256 was pinned for; another address is trusted afresh. */
  certUrl?: string;
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
