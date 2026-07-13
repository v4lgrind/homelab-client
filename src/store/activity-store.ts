import { defineStore } from "pinia";
import { arrClientFor } from "@/services/arr-factory";
import type { ArrClient } from "@/services/arr";
import type {
  HistoryItem,
  HistoryRecordRaw,
  MediaKind,
  QueueItem,
  QueueRecordRaw,
} from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

const IMPORT_EVENTS = new Set(["downloadFolderImported", "seriesFolderImported"]);

function statusLabel(r: QueueRecordRaw): string | undefined {
  const s = (r.trackedDownloadState || r.status || "").toLowerCase();
  if (s.includes("import")) return "Import…";
  if (s === "queued" || s === "delay") return "En file";
  if (s === "paused") return "En pause";
  if (s === "completed") return "Terminé";
  if (s === "warning" || s === "failed") return "Problème";
  return undefined;
}

function epLabel(seasonNumber?: number, episodeNumber?: number, title?: string): string {
  const pad = (n?: number) => String(n ?? 0).padStart(2, "0");
  const code = `S${pad(seasonNumber)}E${pad(episodeNumber)}`;
  return title ? `${code} · ${title}` : code;
}

function queueToItem(r: QueueRecordRaw, kind: MediaKind, client: ArrClient): QueueItem | null {
  const size = r.size ?? 0;
  const left = r.sizeleft ?? size;
  const progress = size > 0 ? Math.min(1, Math.max(0, (size - left) / size)) : 0;
  if (kind === "movie") {
    if (!r.movieId) return null;
    return {
      key: `m-${r.id}`,
      kind,
      mediaId: r.movieId,
      title: r.movie?.title ?? r.title ?? "Film",
      subtitle: r.quality?.quality?.name,
      progress,
      size: r.size,
      sizeleft: r.sizeleft,
      timeleft: r.timeleft,
      statusLabel: statusLabel(r),
      poster: r.movie ? client.posterUrl(r.movie.images, r.movieId) : undefined,
    };
  }
  if (!r.seriesId) return null;
  return {
    key: `s-${r.id}`,
    kind,
    mediaId: r.seriesId,
    title: r.series?.title ?? r.title ?? "Série",
    subtitle: epLabel(r.episode?.seasonNumber, r.episode?.episodeNumber, r.episode?.title),
    progress,
    size: r.size,
    sizeleft: r.sizeleft,
    timeleft: r.timeleft,
    statusLabel: statusLabel(r),
    poster: r.series ? client.posterUrl(r.series.images, r.seriesId) : undefined,
  };
}

function historyToItem(r: HistoryRecordRaw, kind: MediaKind, client: ArrClient): HistoryItem | null {
  if (kind === "movie") {
    if (!r.movieId) return null;
    return {
      key: `hm-${r.id}`,
      kind,
      mediaId: r.movieId,
      title: r.movie?.title ?? r.sourceTitle ?? "Film",
      subtitle: r.quality?.quality?.name,
      date: r.date,
      poster: r.movie ? client.posterUrl(r.movie.images, r.movieId) : undefined,
    };
  }
  if (!r.seriesId) return null;
  return {
    key: `hs-${r.id}`,
    kind,
    mediaId: r.seriesId,
    title: r.series?.title ?? r.sourceTitle ?? "Série",
    subtitle: epLabel(r.episode?.seasonNumber, r.episode?.episodeNumber, r.episode?.title),
    date: r.date,
    poster: r.series ? client.posterUrl(r.series.images, r.seriesId) : undefined,
  };
}

interface State {
  queue: QueueItem[];
  recent: HistoryItem[];
  state: LoadState;
  error?: string;
}

export const useActivityStore = defineStore("activity", {
  state: (): State => ({ queue: [], recent: [], state: "idle" }),

  actions: {
    async fetch(force = false) {
      // Keep the current data on a background refresh (avoid flicker).
      if (this.state === "idle" || force) this.state = this.queue.length ? "ready" : "loading";
      this.error = undefined;

      const movieClient = arrClientFor("movie");
      const seriesClient = arrClientFor("series");

      const [mQueue, sQueue, mHist, sHist] = await Promise.allSettled([
        movieClient.getMovieQueue(),
        seriesClient.getSeriesQueue(),
        movieClient.getMovieHistory(),
        seriesClient.getSeriesHistory(),
      ]);

      const queue: QueueItem[] = [];
      if (mQueue.status === "fulfilled")
        queue.push(
          ...mQueue.value.records
            .map((r) => queueToItem(r, "movie", movieClient))
            .filter((q): q is QueueItem => q !== null),
        );
      if (sQueue.status === "fulfilled")
        queue.push(
          ...sQueue.value.records
            .map((r) => queueToItem(r, "series", seriesClient))
            .filter((q): q is QueueItem => q !== null),
        );
      queue.sort((a, b) => b.progress - a.progress);

      const recent: HistoryItem[] = [];
      if (mHist.status === "fulfilled")
        recent.push(
          ...mHist.value.records
            .filter((r) => IMPORT_EVENTS.has(r.eventType))
            .map((r) => historyToItem(r, "movie", movieClient))
            .filter((h): h is HistoryItem => h !== null),
        );
      if (sHist.status === "fulfilled")
        recent.push(
          ...sHist.value.records
            .filter((r) => IMPORT_EVENTS.has(r.eventType))
            .map((r) => historyToItem(r, "series", seriesClient))
            .filter((h): h is HistoryItem => h !== null),
        );
      recent.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

      const allFailed =
        mQueue.status === "rejected" &&
        sQueue.status === "rejected" &&
        mHist.status === "rejected" &&
        sHist.status === "rejected";
      if (allFailed) {
        this.state = "error";
        this.error = "Erreur de chargement de l'activité";
        return;
      }

      this.queue = queue;
      this.recent = recent.slice(0, 15);
      this.state = "ready";
    },
  },
});
