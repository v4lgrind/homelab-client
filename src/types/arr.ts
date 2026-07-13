export interface ArrImage {
  coverType: string; // "poster" | "fanart" | "banner" | ...
  remoteUrl?: string; // public CDN (TMDB/TheTVDB) — no auth needed
  url?: string; // local path on the service (needs API key)
}

export interface QualityInfo {
  quality?: { name?: string; resolution?: number };
}

export interface MovieFile {
  id: number;
  size?: number;
  quality?: QualityInfo;
}

/** Radarr movie (subset of /api/v3/movie). */
export interface Movie {
  id: number;
  title: string;
  year: number;
  overview?: string;
  monitored: boolean;
  hasFile: boolean;
  sizeOnDisk?: number;
  runtime?: number;
  status?: string;
  images: ArrImage[];
  ratings?: Record<string, { value?: number } | undefined>;
  tmdbId?: number;
  genres?: string[];
  studio?: string;
  certification?: string;
  qualityProfileId?: number;
  movieFile?: MovieFile;
  added?: string; // ISO date
  // release dates (calendar)
  inCinemas?: string;
  digitalRelease?: string;
  physicalRelease?: string;
}

/** Sonarr series statistics (subset). */
export interface SeriesStatistics {
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount?: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
}

export interface Season {
  seasonNumber: number;
  monitored: boolean;
  statistics?: SeriesStatistics;
}

/** Sonarr series (subset of /api/v3/series). */
export interface Series {
  id: number;
  title: string;
  year: number;
  overview?: string;
  monitored: boolean;
  status?: string;
  network?: string;
  runtime?: number;
  images: ArrImage[];
  statistics?: SeriesStatistics;
  seasons?: Season[];
  tvdbId?: number;
  genres?: string[];
  certification?: string;
  qualityProfileId?: number;
  added?: string; // ISO date
}

/** Sonarr episode (subset — as returned by the calendar with includeSeries). */
export interface Episode {
  id: number;
  seriesId: number;
  title?: string;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc?: string;
  airDate?: string;
  hasFile: boolean;
  monitored: boolean;
  series?: Series;
}

/** Normalised calendar row (movie release or series episode). */
export interface CalendarEntry {
  kind: MediaKind;
  id: number; // movie id or series id (for navigation)
  date: string; // ISO datetime of the release / air
  title: string;
  subtitle?: string;
  poster?: string;
  monitored: boolean;
  hasFile: boolean;
}

export interface Paged<T> {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: T[];
}

/** Raw record from /api/v3/queue. */
export interface QueueRecordRaw {
  id: number;
  movieId?: number;
  seriesId?: number;
  episodeId?: number;
  title?: string; // release title
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  status?: string;
  trackedDownloadState?: string;
  trackedDownloadStatus?: string;
  quality?: QualityInfo;
  movie?: Movie;
  series?: Series;
  episode?: Episode;
}

/** Raw record from /api/v3/history. */
export interface HistoryRecordRaw {
  id: number;
  eventType: string;
  date: string;
  movieId?: number;
  seriesId?: number;
  sourceTitle?: string;
  quality?: QualityInfo;
  movie?: Movie;
  series?: Series;
  episode?: Episode;
}

/** Normalised download-queue row. */
export interface QueueItem {
  key: string;
  kind: MediaKind;
  mediaId: number;
  title: string;
  subtitle?: string;
  progress: number; // 0..1
  size?: number;
  sizeleft?: number;
  timeleft?: string;
  statusLabel?: string;
  poster?: string;
}

/** Normalised history (recently imported) row. */
export interface HistoryItem {
  key: string;
  kind: MediaKind;
  mediaId: number;
  title: string;
  subtitle?: string;
  date: string;
  poster?: string;
}

/** A release returned by the interactive search (/api/v3/release). */
export interface Release {
  guid: string;
  title: string;
  indexer?: string;
  indexerId?: number;
  size?: number;
  seeders?: number;
  leechers?: number;
  age?: number; // days
  ageMinutes?: number;
  quality?: QualityInfo;
  protocol?: string; // "torrent" | "usenet"
  approved?: boolean;
  rejected?: boolean;
  rejections?: string[];
  seasonNumber?: number;
}

/** A movie or series as returned in full by the detail endpoints. */
export type MediaDetail = Movie | Series;

export type MediaKind = "movie" | "series";

/** Normalised view-model used by the library grid (movies + series share it). */
export interface MediaItem {
  kind: MediaKind;
  id: number;
  title: string;
  year: number;
  monitored: boolean;
  /** true when the media is fully available on disk. */
  complete: boolean;
  poster?: string;
  /** short status line, e.g. "1080p" or "8/10 épisodes". */
  subtitle?: string;
  /** ISO date the item was added to Radarr/Sonarr (for sorting). */
  added?: string;
  /** size on disk in bytes (for sorting). */
  size?: number;
}
