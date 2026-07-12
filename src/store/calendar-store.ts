import { defineStore } from "pinia";
import { arrClientFor } from "@/services/arr-factory";
import type { CalendarEntry, Episode, Movie } from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function movieToEntry(m: Movie, poster: string | undefined, startMs: number): CalendarEntry | null {
  const candidates: { date: string; label: string }[] = [];
  if (m.inCinemas) candidates.push({ date: m.inCinemas, label: "Au cinéma" });
  if (m.digitalRelease) candidates.push({ date: m.digitalRelease, label: "Sortie digitale" });
  if (m.physicalRelease) candidates.push({ date: m.physicalRelease, label: "Sortie physique" });
  if (!candidates.length) return null;

  // Show the date that actually falls in the window (earliest upcoming); if all
  // are in the past, fall back to the earliest so it still renders.
  const byDate = (a: { date: string }, b: { date: string }) => Date.parse(a.date) - Date.parse(b.date);
  const upcoming = candidates.filter((c) => Date.parse(c.date) >= startMs).sort(byDate);
  const chosen = upcoming[0] ?? candidates.slice().sort(byDate)[0];

  return {
    kind: "movie",
    id: m.id,
    date: chosen.date,
    title: m.title,
    subtitle: chosen.label,
    poster,
    monitored: m.monitored,
    hasFile: m.hasFile,
  };
}

function episodeToEntry(e: Episode, poster?: string): CalendarEntry | null {
  const date = e.airDateUtc || e.airDate;
  if (!date) return null;
  return {
    kind: "series",
    id: e.seriesId,
    date,
    title: e.series?.title ?? "Épisode",
    subtitle: `S${pad(e.seasonNumber)}E${pad(e.episodeNumber)}${e.title ? ` · ${e.title}` : ""}`,
    poster,
    monitored: e.monitored,
    hasFile: e.hasFile,
  };
}

interface State {
  entries: CalendarEntry[];
  state: LoadState;
  error?: string;
}

export const useCalendarStore = defineStore("calendar", {
  state: (): State => ({ entries: [], state: "idle" }),

  actions: {
    async fetch(days = 28, force = false) {
      if (this.state === "loading") return;
      if (this.state === "ready" && !force) return;
      this.state = "loading";
      this.error = undefined;

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const startMs = start.getTime();
      const end = new Date(start);
      end.setDate(end.getDate() + days);
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const [movieRes, seriesRes] = await Promise.allSettled([
        (async () => {
          const c = arrClientFor("movie");
          const movies = await c.getMovieCalendar(startISO, endISO);
          return movies
            .map((m) => movieToEntry(m, c.posterUrl(m.images, m.id), startMs))
            .filter((e): e is CalendarEntry => e !== null);
        })(),
        (async () => {
          const c = arrClientFor("series");
          const eps = await c.getSeriesCalendar(startISO, endISO);
          return eps
            .map((e) => episodeToEntry(e, e.series ? c.posterUrl(e.series.images, e.series.id) : undefined))
            .filter((e): e is CalendarEntry => e !== null);
        })(),
      ]);

      const entries: CalendarEntry[] = [];
      if (movieRes.status === "fulfilled") entries.push(...movieRes.value);
      if (seriesRes.status === "fulfilled") entries.push(...seriesRes.value);

      if (movieRes.status === "rejected" && seriesRes.status === "rejected") {
        this.state = "error";
        this.error = "Erreur de chargement du calendrier";
        return;
      }

      entries.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      this.entries = entries;
      this.state = "ready";
    },
  },
});
