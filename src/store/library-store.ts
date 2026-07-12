import { defineStore } from "pinia";
import { createArrClient, type ArrClient } from "@/services/arr";
import { useConnectionStore } from "@/store/connection-store";
import { HttpError } from "@/services/http";
import type { MediaItem, Movie, Series } from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

interface State {
  movies: MediaItem[];
  series: MediaItem[];
  moviesState: LoadState;
  seriesState: LoadState;
  moviesError?: string;
  seriesError?: string;
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
  };
}

export const useLibraryStore = defineStore("library", {
  state: (): State => ({
    movies: [],
    series: [],
    moviesState: "idle",
    seriesState: "idle",
  }),

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
  },
});
