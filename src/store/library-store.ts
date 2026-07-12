import { defineStore } from "pinia";
import { createArrClient, type ArrClient } from "@/services/arr";
import { useConnectionStore } from "@/store/connection-store";
import { HttpError } from "@/services/http";
import type { MediaDetail, MediaItem, MediaKind, Movie, Series } from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

export type LibTab = "movie" | "series";
export type LibFilter = "all" | "missing" | "monitored";
export type SortKey = "title" | "added" | "year" | "size";
export type SortDir = "asc" | "desc";

interface State {
  movies: MediaItem[];
  series: MediaItem[];
  moviesState: LoadState;
  seriesState: LoadState;
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

export const useLibraryStore = defineStore("library", {
  state: (): State => ({
    movies: [],
    series: [],
    moviesState: "idle",
    seriesState: "idle",
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

  // Only the view preferences are persisted; lists/detail refetch fresh.
  persist: {
    pick: ["tab", "filter", "sortKey", "sortDir"],
  },

  actions: {
    _client(id: "radarr" | "sonarr"): ArrClient {
      const c = useConnectionStore();
      return createArrClient(id, c.services[id].subdomain, c.rootDomain, c.apiKeys[id] ?? "");
    },

    async fetchMovies(force = false) {
      if (this.moviesState === "loading") return;
      if (this.moviesState === "ready" && !force) return;
      this.moviesState = "loading";
      this.moviesError = undefined;
      try {
        const client = this._client("radarr");
        const movies = await client.getMovies();
        this.movies = movies
          .map((m) => movieToItem(m, client.posterUrl(m.images, m.id)))
          .sort((a, b) => a.title.localeCompare(b.title));
        this.moviesState = "ready";
      } catch (e) {
        this.moviesState = "error";
        this.moviesError = e instanceof HttpError ? e.message : "Erreur de chargement";
      }
    },

    async fetchSeries(force = false) {
      if (this.seriesState === "loading") return;
      if (this.seriesState === "ready" && !force) return;
      this.seriesState = "loading";
      this.seriesError = undefined;
      try {
        const client = this._client("sonarr");
        const series = await client.getSeries();
        this.series = series
          .map((s) => seriesToItem(s, client.posterUrl(s.images, s.id)))
          .sort((a, b) => a.title.localeCompare(b.title));
        this.seriesState = "ready";
      } catch (e) {
        this.seriesState = "error";
        this.seriesError = e instanceof HttpError ? e.message : "Erreur de chargement";
      }
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
