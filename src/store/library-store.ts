import { defineStore } from "pinia";
import { createArrClient, withApiKey, type ArrClient } from "@/services/arr";
import { useConnectionStore } from "@/store/connection-store";
import { HttpError, serviceBaseUrl } from "@/services/http";
import type { MediaDetail, MediaItem, MediaKind, Movie, Series } from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

/** How long a cached list is served without hitting the server. The refresh
 *  button always forces a revalidation regardless. */
const TTL_MS = 30 * 60 * 1000;

export type LibTab = "movie" | "series";
export type LibFilter = "all" | "missing" | "monitored";
export type SortKey = "title" | "added" | "year" | "size";
export type SortDir = "asc" | "desc";

interface State {
  /** Cached lists. Poster URLs are stored key-less — see withApiKey(). */
  movies: MediaItem[];
  series: MediaItem[];
  /** epoch ms of the last successful fetch, used for the TTL. */
  moviesFetchedAt?: number;
  seriesFetchedAt?: number;
  moviesState: LoadState;
  seriesState: LoadState;
  /** true while refreshing on top of an already-displayed cached list. */
  moviesRevalidating: boolean;
  seriesRevalidating: boolean;
  moviesError?: string;
  seriesError?: string;

  // View preferences (persisted — survive navigation and restarts)
  tab: LibTab;
  filter: LibFilter;
  sortKey: SortKey;
  sortDir: SortDir;

  // Detail view
  detail: MediaDetail | null;
  detailKind: MediaKind | null;
  detailState: LoadState;
  detailError?: string;
  /** true while a monitor/search/delete action is in flight. */
  actionBusy: boolean;
  /** true briefly after a successful search trigger (for UI feedback). */
  searchTriggered: boolean;
}

function movieToItem(m: Movie, poster?: string): MediaItem {
  return {
    kind: "movie",
    id: m.id,
    title: m.title,
    year: m.year,
    monitored: m.monitored,
    complete: m.hasFile,
    poster,
    added: m.added,
    size: m.sizeOnDisk,
  };
}

function seriesToItem(s: Series, poster?: string): MediaItem {
  const st = s.statistics;
  const complete = !!st && st.episodeCount > 0 && st.percentOfEpisodes >= 100;
  return {
    kind: "series",
    id: s.id,
    title: s.title,
    year: s.year,
    monitored: s.monitored,
    complete,
    poster,
    subtitle: st ? `${st.episodeFileCount}/${st.episodeCount} ép.` : undefined,
    added: s.added,
    size: st?.sizeOnDisk,
  };
}

/** Re-attach the api key to cached cover URLs (they are persisted key-less).
 *  Items whose poster comes from a CDN are returned untouched. */
function keyedItems(items: MediaItem[], id: "radarr" | "sonarr"): MediaItem[] {
  const c = useConnectionStore();
  const key = c.apiKeys[id]?.trim();
  if (!key) return items;
  const base = serviceBaseUrl(id, c.services[id].subdomain, c.rootDomain);
  return items.map((i) =>
    i.poster?.startsWith(base) ? { ...i, poster: withApiKey(i.poster, base, key) } : i,
  );
}

export const useLibraryStore = defineStore("library", {
  state: (): State => ({
    movies: [],
    series: [],
    // Declared up front: a property that is absent from this factory never makes
    // it into $state, so it would silently never be persisted.
    moviesFetchedAt: undefined,
    seriesFetchedAt: undefined,
    moviesState: "idle",
    seriesState: "idle",
    moviesRevalidating: false,
    seriesRevalidating: false,
    tab: "movie",
    filter: "all",
    sortKey: "title",
    sortDir: "asc",
    detail: null,
    detailKind: null,
    detailState: "idle",
    actionBusy: false,
    searchTriggered: false,
  }),

  // View preferences + the cached lists. The lists are shown instantly on launch
  // and revalidated in the background (stale-while-revalidate). Detail always
  // refetches fresh — it is one request and it drives write actions.
  // Poster URLs here are key-less, so no secret ever reaches localStorage.
  persist: {
    pick: ["tab", "filter", "sortKey", "sortDir", "movies", "series", "moviesFetchedAt", "seriesFetchedAt"],
  },

  getters: {
    /** Lists ready to render: the api key is re-attached to our own cover URLs. */
    movieItems(state): MediaItem[] {
      return keyedItems(state.movies, "radarr");
    },
    seriesItems(state): MediaItem[] {
      return keyedItems(state.series, "sonarr");
    },
    /** Rough size of the persisted cache, for the Settings screen. */
    cacheBytes(): number {
      try {
        return localStorage.getItem("library")?.length ?? 0;
      } catch {
        return 0;
      }
    },
  },

  actions: {
    _client(id: "radarr" | "sonarr"): ArrClient {
      const c = useConnectionStore();
      return createArrClient(id, c.services[id].subdomain, c.rootDomain, c.apiKeys[id] ?? "");
    },

    async fetchMovies(force = false) {
      if (this.moviesState === "loading" || this.moviesRevalidating) return;
      const cached = this.movies.length > 0;
      const fresh = !!this.moviesFetchedAt && Date.now() - this.moviesFetchedAt < TTL_MS;
      // Serve the cache instantly, then decide whether the server is worth asking.
      if (cached) {
        this.moviesState = "ready";
        if (fresh && !force) return;
        this.moviesRevalidating = true;
      } else {
        this.moviesState = "loading";
      }
      this.moviesError = undefined;
      try {
        const client = this._client("radarr");
        const movies = await client.getMovies();
        this.movies = movies
          .map((m) => movieToItem(m, client.posterPath(m.images, m.id)))
          .sort((a, b) => a.title.localeCompare(b.title));
        this.moviesFetchedAt = Date.now();
        this.moviesState = "ready";
      } catch (e) {
        // Keep showing the cache if we have one — a failed refresh is not a
        // reason to blank the library.
        if (!cached) {
          this.moviesState = "error";
          this.moviesError = e instanceof HttpError ? e.message : "Erreur de chargement";
        }
      } finally {
        this.moviesRevalidating = false;
      }
    },

    async fetchSeries(force = false) {
      if (this.seriesState === "loading" || this.seriesRevalidating) return;
      const cached = this.series.length > 0;
      const fresh = !!this.seriesFetchedAt && Date.now() - this.seriesFetchedAt < TTL_MS;
      if (cached) {
        this.seriesState = "ready";
        if (fresh && !force) return;
        this.seriesRevalidating = true;
      } else {
        this.seriesState = "loading";
      }
      this.seriesError = undefined;
      try {
        const client = this._client("sonarr");
        const series = await client.getSeries();
        this.series = series
          .map((s) => seriesToItem(s, client.posterPath(s.images, s.id)))
          .sort((a, b) => a.title.localeCompare(b.title));
        this.seriesFetchedAt = Date.now();
        this.seriesState = "ready";
      } catch (e) {
        if (!cached) {
          this.seriesState = "error";
          this.seriesError = e instanceof HttpError ? e.message : "Erreur de chargement";
        }
      } finally {
        this.seriesRevalidating = false;
      }
    },

    /** Drop the cached lists (Settings → vider le cache). */
    clearCache() {
      this.movies = [];
      this.series = [];
      this.moviesFetchedAt = undefined;
      this.seriesFetchedAt = undefined;
      this.moviesState = "idle";
      this.seriesState = "idle";
    },

    async fetchDetail(kind: MediaKind, id: number, force = false) {
      if (this.detailState === "loading") return;
      if (!force && this.detail && this.detailKind === kind && this.detail.id === id) return;
      this.detailKind = kind;
      this.detailState = "loading";
      this.detailError = undefined;
      this.searchTriggered = false;
      try {
        const client = this._client(kind === "movie" ? "radarr" : "sonarr");
        this.detail = kind === "movie" ? await client.getMovie(id) : await client.getSeriesOne(id);
        this.detailState = "ready";
      } catch (e) {
        this.detailState = "error";
        this.detailError = e instanceof HttpError ? e.message : "Erreur de chargement";
      }
    },

    async toggleMonitored() {
      if (!this.detail || !this.detailKind || this.actionBusy) return;
      const kind = this.detailKind;
      const next = !this.detail.monitored;
      this.detail.monitored = next; // optimistic
      this.actionBusy = true;
      try {
        const client = this._client(kind === "movie" ? "radarr" : "sonarr");
        if (kind === "movie") await client.updateMovie(this.detail as Movie);
        else await client.updateSeries(this.detail as Series);
        const list = kind === "movie" ? this.movies : this.series;
        const item = list.find((i) => i.id === this.detail!.id);
        if (item) item.monitored = next;
      } catch {
        this.detail.monitored = !next; // revert on failure
      } finally {
        this.actionBusy = false;
      }
    },

    async searchRelease() {
      if (!this.detail || !this.detailKind || this.actionBusy) return;
      const kind = this.detailKind;
      const id = this.detail.id;
      this.actionBusy = true;
      try {
        const client = this._client(kind === "movie" ? "radarr" : "sonarr");
        await client.command(
          kind === "movie"
            ? { name: "MoviesSearch", movieIds: [id] }
            : { name: "SeriesSearch", seriesId: id },
        );
        this.searchTriggered = true;
      } finally {
        this.actionBusy = false;
      }
    },

    async deleteItem(deleteFiles: boolean): Promise<boolean> {
      if (!this.detail || !this.detailKind || this.actionBusy) return false;
      const kind = this.detailKind;
      const id = this.detail.id;
      this.actionBusy = true;
      try {
        const client = this._client(kind === "movie" ? "radarr" : "sonarr");
        if (kind === "movie") await client.deleteMovie(id, deleteFiles);
        else await client.deleteSeries(id, deleteFiles);
        if (kind === "movie") this.movies = this.movies.filter((i) => i.id !== id);
        else this.series = this.series.filter((i) => i.id !== id);
        this.detail = null;
        this.detailKind = null;
        return true;
      } catch {
        return false;
      } finally {
        this.actionBusy = false;
      }
    },
  },
});
