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

export interface PlexResource {
  name: string;
  product: string;
  provides: string;
  clientIdentifier: string;
  accessToken?: string;
  connections?: { uri: string; local: boolean; relay?: boolean; IPv6?: boolean }[];
}
