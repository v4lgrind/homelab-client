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

function blockedInfo(r: QueueRecordRaw): { blocked: boolean; messages: string[] } {
  const tds = (r.trackedDownloadStatus || "").toLowerCase();
  const messages: string[] = [];
  for (const sm of r.statusMessages ?? []) {
    if (sm.title) messages.push(sm.title);
    for (const m of sm.messages ?? []) if (m && m !== sm.title) messages.push(m);
  }
  if (r.errorMessage) messages.push(r.errorMessage);
  const blocked = tds === "warning" || tds === "error" || messages.length > 0;
  return { blocked, messages };
}

function queueToItem(r: QueueRecordRaw, kind: MediaKind, client: ArrClient): QueueItem | null {
  const size = r.size ?? 0;
  const left = r.sizeleft ?? size;
  const progress = size > 0 ? Math.min(1, Math.max(0, (size - left) / size)) : 0;
  const { blocked, messages } = blockedInfo(r);
  const base = {
    id: r.id,
    downloadId: r.downloadId,
    progress,
    size: r.size,
    sizeleft: r.sizeleft,
    timeleft: r.timeleft,
    statusLabel: statusLabel(r),
    blocked,
    messages,
  };
  if (kind === "movie") {
    if (!r.movieId) return null;
    return {
      ...base,
      key: `m-${r.id}`,
      kind,
      mediaId: r.movieId,
      title: r.movie?.title ?? r.title ?? "Film",
      subtitle: r.quality?.quality?.name,
      poster: r.movie ? client.posterUrl(r.movie.images, r.movieId) : undefined,
    };
  }
  if (!r.seriesId) return null;
  return {
    ...base,
    key: `s-${r.id}`,
    kind,
    mediaId: r.seriesId,
    title: r.series?.title ?? r.title ?? "Série",
    subtitle: epLabel(r.episode?.seasonNumber, r.episode?.episodeNumber, r.episode?.title),
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
  /** key of the queue item currently running an action (import/remove). */
  actionBusyKey: string | null;
}

export const useActivityStore = defineStore("activity", {
  state: (): State => ({ queue: [], recent: [], state: "idle", actionBusyKey: null }),

  actions: {
    /** Force the blocked import through, using the auto-detected mapping. */
    async forceImport(item: QueueItem): Promise<boolean> {
      if (!item.downloadId || this.actionBusyKey) return false;
      this.actionBusyKey = item.key;
      try {
        const client = arrClientFor(item.kind);
        const files = await client.getManualImport(item.downloadId);
        const usable = files.filter((f) =>
          item.kind === "movie" ? !!f.movie : !!f.series && (f.episodes?.length ?? 0) > 0,
        );
        if (!usable.length) return false;
        const payload = usable.map((f) =>
          item.kind === "movie"
            ? {
                path: f.path,
                movieId: f.movie!.id,
                quality: f.quality,
                languages: f.languages,
                releaseGroup: f.releaseGroup,
                downloadId: item.downloadId,
              }
            : {
                path: f.path,
                seriesId: f.series!.id,
                episodeIds: (f.episodes ?? []).map((e) => e.id),
                quality: f.quality,
                languages: f.languages,
                releaseGroup: f.releaseGroup,
                downloadId: item.downloadId,
              },
        );
        await client.command({ name: "ManualImport", importMode: "auto", files: payload });
        await this.fetch(true);
        return true;
      } catch {
        return false;
      } finally {
        this.actionBusyKey = null;
      }
    },

    /** Remove from the queue; when blocklist is true, blocklist + re-search. */
    async removeFromQueue(item: QueueItem, blocklist: boolean): Promise<boolean> {
      if (this.actionBusyKey) return false;
      this.actionBusyKey = item.key;
      try {
        const client = arrClientFor(item.kind);
        await client.deleteQueueItem(item.id, {
          removeFromClient: true,
          blocklist,
          skipRedownload: !blocklist,
        });
        await this.fetch(true);
        return true;
      } catch {
        return false;
      } finally {
        this.actionBusyKey = null;
      }
    },

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
