import { defineStore } from "pinia";
import { useConnectionStore } from "@/store/connection-store";
import { createJellyfinClient } from "@/services/jellyfin";
import { createPlexClient } from "@/services/plex";
import { HttpError } from "@/services/http";
import type {
  JellyfinSessionRaw,
  MediaServerHealth,
  MediaSession,
  PlexSessionRaw,
} from "@/types/media";

/** Jellyfin reports time in 100-nanosecond ticks. */
const TICKS_PER_MS = 10_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/* ---------- Jellyfin ---------- */

function jellyfinSubtitle(item: NonNullable<JellyfinSessionRaw["NowPlayingItem"]>): string | undefined {
  if (item.Type === "Episode" && item.ParentIndexNumber != null && item.IndexNumber != null) {
    const code = `S${pad(item.ParentIndexNumber)}E${pad(item.IndexNumber)}`;
    return item.SeriesName ? `${code} · ${item.SeriesName}` : code;
  }
  return item.ProductionYear ? String(item.ProductionYear) : undefined;
}

function normaliseJellyfin(raw: JellyfinSessionRaw, client: ReturnType<typeof createJellyfinClient>): MediaSession | undefined {
  const item = raw.NowPlayingItem;
  if (!item) return undefined;

  const t = raw.TranscodingInfo;
  // Jellyfin reports the streams separately; either one transcoding counts.
  const transcoding = !!t && (t.IsVideoDirect === false || t.IsAudioDirect === false);

  return {
    id: `jellyfin-${raw.Id}`,
    server: "jellyfin",
    user: raw.UserName ?? "Inconnu",
    device: raw.DeviceName ?? raw.Client ?? "Appareil inconnu",
    title: item.Name ?? "Sans titre",
    subtitle: jellyfinSubtitle(item),
    posterUrl: client.imageUrl(item.Id),
    positionMs: (raw.PlayState?.PositionTicks ?? 0) / TICKS_PER_MS,
    durationMs: (item.RunTimeTicks ?? 0) / TICKS_PER_MS,
    paused: raw.PlayState?.IsPaused ?? false,
    transcoding,
    transcodeDetail: transcoding && t?.Height ? `${t.Height}p` : undefined,
    bitrateKbps: t?.Bitrate ? Math.round(t.Bitrate / 1000) : undefined,
  };
}

/* ---------- Plex ---------- */

function plexSubtitle(raw: PlexSessionRaw): string | undefined {
  if (raw.type === "episode" && raw.parentIndex != null && raw.index != null) {
    const code = `S${pad(raw.parentIndex)}E${pad(raw.index)}`;
    return raw.grandparentTitle ? `${code} · ${raw.grandparentTitle}` : code;
  }
  return raw.year ? String(raw.year) : undefined;
}

function normalisePlex(raw: PlexSessionRaw, client: ReturnType<typeof createPlexClient>): MediaSession {
  const media = raw.Media?.[0];
  const ts = raw.TranscodeSession;
  const transcoding =
    (!!ts && (ts.videoDecision === "transcode" || ts.audioDecision === "transcode")) ||
    media?.Part?.[0]?.decision === "transcode";

  // Episodes carry their own still frame in `thumb`; the series poster reads
  // better in a list, so prefer it.
  const thumb = raw.type === "episode" ? (raw.grandparentThumb ?? raw.thumb) : raw.thumb;

  return {
    id: `plex-${raw.sessionKey ?? raw.ratingKey}`,
    server: "plex",
    user: raw.User?.title ?? "Inconnu",
    device: raw.Player?.title ?? raw.Player?.product ?? "Appareil inconnu",
    title: raw.title ?? "Sans titre",
    subtitle: plexSubtitle(raw),
    posterUrl: thumb ? client.imageUrl(thumb) : undefined,
    positionMs: raw.viewOffset ?? 0,
    durationMs: raw.duration ?? 0,
    paused: raw.Player?.state === "paused",
    transcoding,
    transcodeDetail: transcoding && ts?.height ? `${ts.height}p` : undefined,
    bitrateKbps: raw.Session?.bandwidth ?? media?.bitrate,
  };
}

/* ---------- store ---------- */

interface State {
  sessions: MediaSession[];
  health: MediaServerHealth[];
  loading: boolean;
  loadedOnce: boolean;
}

export const useMediaServersStore = defineStore("mediaservers", {
  state: (): State => ({
    sessions: [],
    health: [],
    loading: false,
    loadedOnce: false,
  }),

  getters: {
    /** Whether at least one media server is set up at all. */
    anyConfigured(): boolean {
      const c = useConnectionStore();
      return !!c.apiKeys.jellyfin?.trim() || !!c.apiKeys.plex?.trim();
    },
    playing(state): MediaSession[] {
      return state.sessions.filter((s) => !s.paused);
    },
  },

  actions: {
    async fetchJellyfin(): Promise<{ sessions: MediaSession[]; health?: MediaServerHealth }> {
      const c = useConnectionStore();
      const token = c.apiKeys.jellyfin?.trim();
      const host = c.hostOf("jellyfin");
      if (!token || !host) return { sessions: [] };

      const pull = async (t: string) => {
        const client = createJellyfinClient(host, t);
        const [info, raw] = await Promise.all([client.getSystemInfo(), client.getSessions()]);
        return {
          info,
          sessions: raw
            .map((s) => normaliseJellyfin(s, client))
            .filter((s): s is MediaSession => s !== undefined),
        };
      };

      try {
        let out;
        try {
          out = await pull(token);
        } catch (e) {
          // A stored token can be revoked server-side. With a username and
          // password on file we can silently get a new one; otherwise the user
          // has to redo Quick Connect, so let the error through.
          const recoverable =
            e instanceof HttpError && e.kind === "auth" && c.authTypeOf("jellyfin") === "userpass";
          if (!recoverable) throw e;
          out = await pull(await c.loginJellyfin());
        }
        return {
          sessions: out.sessions,
          health: {
            server: "jellyfin",
            online: true,
            version: out.info.Version,
            name: out.info.ServerName,
          },
        };
      } catch (e) {
        return {
          sessions: [],
          health: {
            server: "jellyfin",
            online: false,
            error: e instanceof HttpError ? e.message : "Injoignable",
          },
        };
      }
    },

    async fetchPlex(): Promise<{ sessions: MediaSession[]; health?: MediaServerHealth }> {
      const c = useConnectionStore();
      const token = c.plexServerToken || c.apiKeys.plex?.trim();
      const svc = c.services.plex;
      if (!token || !svc.baseUrl) return { sessions: [] };

      const client = createPlexClient(svc.baseUrl, token);
      try {
        const [identity, raw] = await Promise.all([client.getIdentity(), client.getSessions()]);
        const sessions = (raw.MediaContainer?.Metadata ?? []).map((s) => normalisePlex(s, client));
        return {
          sessions,
          health: {
            server: "plex",
            online: true,
            version: identity.MediaContainer?.version,
            name: identity.MediaContainer?.friendlyName ?? svc.serverName,
          },
        };
      } catch (e) {
        return {
          sessions: [],
          health: {
            server: "plex",
            online: false,
            error: e instanceof HttpError ? e.message : "Injoignable",
          },
        };
      }
    },

    /** Refresh both servers at once; one being down must not hide the other. */
    async fetchAll() {
      this.loading = true;
      try {
        const [jf, plex] = await Promise.all([this.fetchJellyfin(), this.fetchPlex()]);
        this.sessions = [...jf.sessions, ...plex.sessions].sort((a, b) =>
          a.paused === b.paused ? a.user.localeCompare(b.user) : a.paused ? 1 : -1,
        );
        this.health = [jf.health, plex.health].filter((h): h is MediaServerHealth => h !== undefined);
        this.loadedOnce = true;
      } finally {
        this.loading = false;
      }
    },
  },
});
