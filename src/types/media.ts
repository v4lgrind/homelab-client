export type MediaServerId = "jellyfin" | "plex";

/** A playback session, normalised so Jellyfin and Plex render identically. */
export interface MediaSession {
  /** Stable across refreshes, so the list does not flicker. */
  id: string;
  server: MediaServerId;
  user: string;
  device: string;
  title: string;
  /** "2026" for a movie, "S02E05 · Show name" for an episode. */
  subtitle?: string;
  posterUrl?: string;
  positionMs: number;
  durationMs: number;
  paused: boolean;
  /** Any transcoding at all (video or audio). */
  transcoding: boolean;
  /** e.g. "1080p → 720p", when the server tells us. */
  transcodeDetail?: string;
  /** Stream bitrate in kbps, when known. */
  bitrateKbps?: number;
}

export interface MediaServerHealth {
  server: MediaServerId;
  online: boolean;
  version?: string;
  name?: string;
  error?: string;
}

/* ---------- Jellyfin wire shapes (subset) ---------- */

export interface QuickConnectState {
  Authenticated: boolean;
  Secret: string;
  Code: string;
}

export interface JellyfinSystemInfo {
  Version?: string;
  ServerName?: string;
}

export interface JellyfinSessionRaw {
  Id: string;
  UserName?: string;
  DeviceName?: string;
  Client?: string;
  NowPlayingItem?: {
    Id: string;
    Name?: string;
    Type?: string;
    ProductionYear?: number;
    SeriesName?: string;
    ParentIndexNumber?: number;
    IndexNumber?: number;
    RunTimeTicks?: number;
  };
  PlayState?: {
    PositionTicks?: number;
    IsPaused?: boolean;
  };
  TranscodingInfo?: {
    IsVideoDirect?: boolean;
    IsAudioDirect?: boolean;
    Bitrate?: number;
    Height?: number;
    Width?: number;
  };
}

/* ---------- Plex wire shapes (subset) ---------- */

export interface PlexPin {
  id: number;
  code: string;
  authToken?: string | null;
}

export interface PlexConnection {
  uri: string;
  local: boolean;
  relay?: boolean;
  IPv6?: boolean;
}

export interface PlexResource {
  name: string;
  product: string;
  provides: string;
  clientIdentifier: string;
  accessToken?: string;
  connections?: PlexConnection[];
}

/** A Plex server the user owns, reachable at a probed connection URI. */
export interface PlexServer {
  name: string;
  clientIdentifier: string;
  /** Connection that actually answered — LAN address or plex.direct URL. */
  uri: string;
  /** Server-scoped token; differs from the account token. */
  accessToken: string;
}

export interface PlexIdentity {
  MediaContainer?: {
    friendlyName?: string;
    version?: string;
    machineIdentifier?: string;
  };
}

export interface PlexSessionRaw {
  sessionKey?: string;
  ratingKey?: string;
  title?: string;
  type?: string;
  year?: number;
  /** Series name, for episodes. */
  grandparentTitle?: string;
  /** Season number, for episodes. */
  parentIndex?: number;
  /** Episode number, for episodes. */
  index?: number;
  /** Total runtime in ms — Plex already uses ms, unlike Jellyfin ticks. */
  duration?: number;
  viewOffset?: number;
  thumb?: string;
  grandparentThumb?: string;
  User?: { title?: string };
  Player?: { title?: string; product?: string; state?: string };
  Session?: { id?: string; bandwidth?: number };
  Media?: {
    videoResolution?: string;
    bitrate?: number;
    Part?: { decision?: string }[];
  }[];
  TranscodeSession?: {
    videoDecision?: string;
    audioDecision?: string;
    sourceVideoCodec?: string;
    videoCodec?: string;
    height?: number;
  };
}

export interface PlexSessionsResponse {
  MediaContainer?: {
    size?: number;
    Metadata?: PlexSessionRaw[];
  };
}
