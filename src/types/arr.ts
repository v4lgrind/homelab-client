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
}

/** Sonarr series statistics (subset). */
export interface SeriesStatistics {
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount?: number;
  sizeOnDisk: number;
  percentOfEpisodes: number;
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
  tvdbId?: number;
  genres?: string[];
  certification?: string;
  qualityProfileId?: number;
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
}
