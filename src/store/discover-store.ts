import { defineStore } from "pinia";
import { arrClientFor } from "@/services/arr-factory";
import { HttpError } from "@/services/http";
import type {
  AddOptions,
  MediaKind,
  Movie,
  QualityProfile,
  RootFolder,
  SearchResult,
  Series,
} from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

/** Profiles + root folders for one service, fetched once and reused. */
interface AddMeta {
  profiles: QualityProfile[];
  rootFolders: RootFolder[];
}

interface State {
  kind: MediaKind;
  term: string;
  results: SearchResult[];
  state: LoadState;
  error?: string;
  /** Cached per kind — they change rarely and every add needs them. */
  meta: Partial<Record<MediaKind, AddMeta>>;
  /** externalIds currently being added, so the row can show a spinner. */
  adding: number[];
  /** externalIds added this session, so the row flips to a done state. */
  added: number[];
  addError?: string;
}

/** Radarr's rating is a per-source map; prefer TMDB then IMDb, else any. */
function movieRating(ratings: Movie["ratings"]): number | undefined {
  if (!ratings) return undefined;
  return ratings.tmdb?.value ?? ratings.imdb?.value ?? Object.values(ratings)[0]?.value;
}

export const useDiscoverStore = defineStore("discover", {
  state: (): State => ({
    kind: "movie",
    term: "",
    results: [],
    state: "idle",
    meta: {},
    adding: [],
    added: [],
  }),

  getters: {
    isAdding: (state) => (externalId: number) => state.adding.includes(externalId),
    isAdded: (state) => (externalId: number) => state.added.includes(externalId),
  },

  actions: {
    setKind(kind: MediaKind) {
      if (kind === this.kind) return;
      this.kind = kind;
      this.results = [];
      this.state = "idle";
      this.error = undefined;
    },

    /** Look the term up against the current kind's service. */
    async search(term: string) {
      this.term = term;
      const q = term.trim();
      if (q.length < 2) {
        this.results = [];
        this.state = "idle";
        return;
      }

      const kind = this.kind;
      this.state = "loading";
      this.error = undefined;
      try {
        const client = arrClientFor(kind);
        const raw =
          kind === "movie" ? await client.lookupMovie(q) : await client.lookupSeries(q);

        // A late response from a previous term must not overwrite a newer one.
        if (this.term.trim() !== q || this.kind !== kind) return;

        this.results = raw.map((item): SearchResult => {
          const isMovie = kind === "movie";
          const m = item as Movie;
          const s = item as Series;
          return {
            kind,
            externalId: (isMovie ? m.tmdbId : s.tvdbId) ?? 0,
            libraryId: item.id ?? 0,
            title: item.title,
            year: item.year || undefined,
            overview: item.overview,
            runtime: item.runtime,
            rating: isMovie ? movieRating(m.ratings) : s.ratings?.value,
            network: isMovie ? undefined : s.network,
            poster: client.posterUrl(item.images, item.id ?? 0),
            raw: item,
          };
        });
        this.state = "ready";
      } catch (e) {
        if (this.term.trim() !== q || this.kind !== kind) return;
        this.state = "error";
        this.error = e instanceof HttpError ? e.message : "Échec de la recherche";
      }
    },

    /** Load quality profiles + root folders for a kind (cached after first call). */
    async loadMeta(kind: MediaKind): Promise<AddMeta> {
      const cached = this.meta[kind];
      if (cached) return cached;
      const client = arrClientFor(kind);
      const [profiles, rootFolders] = await Promise.all([
        client.getQualityProfiles(),
        client.getRootFolders(),
      ]);
      const meta = { profiles, rootFolders };
      this.meta[kind] = meta;
      return meta;
    },

    async add(result: SearchResult, opts: AddOptions): Promise<boolean> {
      if (this.adding.includes(result.externalId)) return false;
      this.adding.push(result.externalId);
      this.addError = undefined;
      try {
        const client = arrClientFor(result.kind);
        if (result.kind === "movie") {
          await client.addMovie(result.raw as Movie, opts);
        } else {
          await client.addSeries(result.raw as Series, opts);
        }
        this.added.push(result.externalId);
        return true;
      } catch (e) {
        this.addError = e instanceof HttpError ? e.message : "Échec de l'ajout";
        return false;
      } finally {
        this.adding = this.adding.filter((id) => id !== result.externalId);
      }
    },
  },
});
