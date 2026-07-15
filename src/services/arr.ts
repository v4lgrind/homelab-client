import { ServiceHttp, serviceBaseUrl } from "@/services/http";
import type { ArrSystemStatus, ServiceId } from "@/types/service";
import type {
  ArrImage,
  Episode,
  HistoryRecordRaw,
  ManualImportFile,
  Movie,
  Paged,
  QueueRecordRaw,
  Release,
  Series,
} from "@/types/arr";

/**
 * Append the api key to one of our own mediacover URLs. Cover URLs are cached in
 * persisted state, so they are stored key-less (the key is a secret and lives in
 * Preferences, never in localStorage) and completed at render time. CDN URLs need
 * no key and are returned untouched.
 */
export function withApiKey(url: string, base: string, apiKey: string): string {
  if (!apiKey || !url.startsWith(base)) return url;
  return `${url}?apikey=${encodeURIComponent(apiKey)}`;
}

/**
 * Client for the *arr v3 API. Radarr (movies) and Sonarr (series) share the
 * same base shape; a single client type exposes both endpoint families and the
 * caller uses the ones relevant to the service.
 */
export function createArrClient(
  id: ServiceId,
  subdomain: string,
  rootDomain: string,
  apiKey: string,
) {
  const base = serviceBaseUrl(id, subdomain, rootDomain);
  const http = new ServiceHttp(base, apiKey);

  /** Radarr and Sonarr both hand out TMDB remoteUrls pointing at /t/p/original —
   *  ~1.4 MB per poster, for a card we render ~330px wide. Rewrite to the size we
   *  actually display (measured: original 1472 KB, w342 53 KB, w780 215 KB).
   *  Other CDNs are left untouched. TMDB caches for a year, so the WebView's HTTP
   *  cache handles repeats on its own — no local image cache needed. */
  function sizedRemote(remoteUrl: string, width: "w342" | "w780"): string {
    return remoteUrl.replace(
      /(https:\/\/image\.tmdb\.org\/t\/p\/)(original|w\d+)(\/)/,
      `$1${width}$3`,
    );
  }

  /** Image URL for a given cover type.
   *
   *  Serve from our own Radarr/Sonarr first: the images are already on disk
   *  there, it keeps the library private (TMDB would otherwise see the device IP
   *  and every poster browsed), and it avoids TMDB rate-limiting on fast scrolls.
   *  Both expose pre-resized variants, so ask for the one matching the display
   *  size rather than the full-resolution original.
   *
   *  Falls back to the public CDN when an item has no local cover yet (freshly
   *  added, cover not downloaded). /api is Authelia-bypassed; the key authenticates. */
  function imagePath(
    images: ArrImage[] | undefined,
    mediaId: number,
    coverType: "poster" | "fanart",
  ): string | undefined {
    const img = images?.find((i) => i.coverType === coverType);
    if (img?.url) {
      // Posters render ~330px wide (grid) / ~290px (detail) -> poster-500.
      // The backdrop is ~1080px but sits under a gradient -> fanart-720.
      const variant = coverType === "poster" ? "poster-500" : "fanart-720";
      return `${base}/api/v3/mediacover/${mediaId}/${variant}.jpg`;
    }
    if (img?.remoteUrl) return sizedRemote(img.remoteUrl, coverType === "poster" ? "w342" : "w780");
    return undefined;
  }

  function imageUrl(
    images: ArrImage[] | undefined,
    mediaId: number,
    coverType: "poster" | "fanart",
  ): string | undefined {
    const path = imagePath(images, mediaId, coverType);
    return path ? withApiKey(path, base, apiKey) : undefined;
  }

  return {
    http,
    base,
    getSystemStatus: () => http.get<ArrSystemStatus>("/api/v3/system/status"),
    // list
    getMovies: () => http.get<Movie[]>("/api/v3/movie"),
    getSeries: () => http.get<Series[]>("/api/v3/series"),
    // detail
    getMovie: (id: number) => http.get<Movie>(`/api/v3/movie/${id}`),
    getSeriesOne: (id: number) => http.get<Series>(`/api/v3/series/${id}`),
    // mutations
    updateMovie: (m: Movie) => http.put<Movie>(`/api/v3/movie/${m.id}`, m),
    updateSeries: (s: Series) => http.put<Series>(`/api/v3/series/${s.id}`, s),
    command: (body: Record<string, unknown>) => http.post("/api/v3/command", body),
    deleteMovie: (id: number, deleteFiles: boolean) =>
      http.del(`/api/v3/movie/${id}`, { params: { deleteFiles, addImportExclusion: false } }),
    deleteSeries: (id: number, deleteFiles: boolean) =>
      http.del(`/api/v3/series/${id}`, { params: { deleteFiles } }),
    // interactive search (indexer queries can be slow → generous timeout)
    getReleases: (params: Record<string, string | number>) =>
      http.get<Release[]>("/api/v3/release", { params, timeoutMs: 90000 }),
    grabRelease: (guid: string, indexerId: number) =>
      http.post("/api/v3/release", { guid, indexerId }),
    // calendar
    getMovieCalendar: (start: string, end: string) =>
      http.get<Movie[]>("/api/v3/calendar", { params: { start, end, unmonitored: true } }),
    getSeriesCalendar: (start: string, end: string) =>
      http.get<Episode[]>("/api/v3/calendar", {
        params: { start, end, unmonitored: true, includeSeries: true },
      }),
    // activity: queue + history
    getMovieQueue: () =>
      http.get<Paged<QueueRecordRaw>>("/api/v3/queue", { params: { pageSize: 100, includeMovie: true } }),
    getSeriesQueue: () =>
      http.get<Paged<QueueRecordRaw>>("/api/v3/queue", {
        params: { pageSize: 100, includeSeries: true, includeEpisode: true },
      }),
    getMovieHistory: () =>
      http.get<Paged<HistoryRecordRaw>>("/api/v3/history", {
        params: { page: 1, pageSize: 30, sortKey: "date", sortDirection: "descending", includeMovie: true },
      }),
    getSeriesHistory: () =>
      http.get<Paged<HistoryRecordRaw>>("/api/v3/history", {
        params: {
          page: 1,
          pageSize: 30,
          sortKey: "date",
          sortDirection: "descending",
          includeSeries: true,
          includeEpisode: true,
        },
      }),
    // blocked-import handling
    getManualImport: (downloadId: string) =>
      http.get<ManualImportFile[]>("/api/v3/manualimport", {
        params: { downloadId, filterExistingFiles: false },
        timeoutMs: 30000,
      }),
    deleteQueueItem: (
      id: number,
      opts: { removeFromClient?: boolean; blocklist?: boolean; skipRedownload?: boolean } = {},
    ) =>
      http.del(`/api/v3/queue/${id}`, {
        params: {
          removeFromClient: opts.removeFromClient ?? true,
          blocklist: opts.blocklist ?? false,
          skipRedownload: opts.skipRedownload ?? false,
        },
      }),
    // helpers
    posterUrl: (images: ArrImage[] | undefined, mediaId: number) => imageUrl(images, mediaId, "poster"),
    fanartUrl: (images: ArrImage[] | undefined, mediaId: number) => imageUrl(images, mediaId, "fanart"),
    /** Key-less poster URL, for list items that get cached in persisted state. */
    posterPath: (images: ArrImage[] | undefined, mediaId: number) => imagePath(images, mediaId, "poster"),
  };
}

export type ArrClient = ReturnType<typeof createArrClient>;
