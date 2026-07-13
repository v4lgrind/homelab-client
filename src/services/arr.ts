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

  /** Image URL for a given cover type — prefer the public CDN (no auth), fall
   *  back to the local /api/mediacover path (bypassed by Authelia, api-key auth). */
  function imageUrl(
    images: ArrImage[] | undefined,
    mediaId: number,
    coverType: "poster" | "fanart",
  ): string | undefined {
    const img = images?.find((i) => i.coverType === coverType);
    if (img?.remoteUrl) return img.remoteUrl;
    if (img?.url) {
      return `${base}/api/v3/mediacover/${mediaId}/${coverType}.jpg?apikey=${encodeURIComponent(apiKey)}`;
    }
    return undefined;
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
  };
}

export type ArrClient = ReturnType<typeof createArrClient>;
