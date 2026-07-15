import { defineStore } from "pinia";
import { createQbitClient, type QbitClient } from "@/services/qbittorrent";

/** Rebuilt whenever the connection config changes; keyed by that config. */
let cachedClient: { key: string; client: QbitClient } | undefined;
import { useConnectionStore } from "@/store/connection-store";
import { HttpError } from "@/services/http";
import type {
  AddTorrentOptions,
  QbitTorrentRaw,
  Torrent,
  TorrentFilter,
  TorrentStatus,
} from "@/types/qbittorrent";

type LoadState = "idle" | "loading" | "ready" | "error";

function mapStatus(state: string): TorrentStatus {
  const s = state.toLowerCase();
  if (s === "error" || s === "missingfiles") return "error";
  if (s.startsWith("paused") || s.startsWith("stopped")) return "paused";
  if (s.startsWith("checking") || s === "moving" || s === "allocating") return "checking";
  if (s === "stalleddl") return "stalled";
  if (s === "stalledup" || s === "uploading" || s === "forcedup" || s === "queuedup") return "seeding";
  return "downloading"; // downloading, metadl, forceddl, queueddl
}

function toTorrent(r: QbitTorrentRaw): Torrent {
  return {
    hash: r.hash,
    name: r.name,
    state: r.state,
    status: mapStatus(r.state ?? ""),
    progress: r.progress ?? 0,
    size: r.size ?? 0,
    dlspeed: r.dlspeed ?? 0,
    upspeed: r.upspeed ?? 0,
    eta: r.eta ?? 0,
    ratio: r.ratio ?? 0,
    numSeeds: r.num_seeds ?? 0,
    numLeechs: r.num_leechs ?? 0,
    category: r.category ?? "",
    addedOn: r.added_on ?? 0,
  };
}

interface State {
  torrents: Torrent[];
  dl: number;
  up: number;
  categories: string[];
  state: LoadState;
  error?: string;
  filter: TorrentFilter;
  actionHash: string | null;
}

export const useQbitStore = defineStore("qbittorrent", {
  state: (): State => ({
    torrents: [],
    dl: 0,
    up: 0,
    categories: [],
    state: "idle",
    filter: "all",
    actionHash: null,
  }),

  persist: { pick: ["filter"] },

  getters: {
    filtered(state): Torrent[] {
      switch (state.filter) {
        case "active":
          return state.torrents.filter((t) => t.dlspeed > 0 || t.upspeed > 0);
        case "downloading":
          return state.torrents.filter((t) => t.status === "downloading" || t.status === "stalled");
        case "completed":
          return state.torrents.filter((t) => t.progress >= 1);
        case "paused":
          return state.torrents.filter((t) => t.status === "paused");
        default:
          return state.torrents;
      }
    },
  },

  actions: {
    /**
     * Run a client call against whichever qBittorrent connection is configured.
     * The client is cached because a direct one holds a login session: building
     * a fresh one per call would re-authenticate on every poll.
     */
    _run<T>(fn: (c: QbitClient) => Promise<T>): Promise<T> {
      const conn = useConnectionStore();
      const cfg = conn.qbitConfig;
      if (!cfg) return Promise.reject(new HttpError("qBittorrent non configuré", 0, "auth"));

      const key = JSON.stringify(cfg);
      if (cachedClient?.key !== key) cachedClient = { key, client: createQbitClient(cfg) };
      return fn(cachedClient.client);
    },

    async fetch(force = false) {
      if (this.state === "loading") return;
      if (this.state === "idle" || force) this.state = this.torrents.length ? "ready" : "loading";
      this.error = undefined;
      try {
        const [raw, transfer, cats] = await this._run((c) =>
          Promise.all([c.getTorrents(), c.getTransferInfo(), c.getCategories().catch(() => ({}))]),
        );
        this.torrents = raw
          .map(toTorrent)
          .sort((a, b) => b.addedOn - a.addedOn);
        this.dl = transfer.dl_info_speed ?? 0;
        this.up = transfer.up_info_speed ?? 0;
        this.categories = Object.keys(cats ?? {}).sort();
        this.state = "ready";
      } catch (e) {
        this.state = "error";
        this.error = e instanceof HttpError ? e.message : "Erreur de chargement";
      }
    },

    async _act(hash: string, fn: (c: QbitClient) => Promise<unknown>): Promise<boolean> {
      if (this.actionHash) return false;
      this.actionHash = hash;
      try {
        await this._run(fn);
        await this.fetch(true);
        return true;
      } catch {
        return false;
      } finally {
        this.actionHash = null;
      }
    },

    pause(t: Torrent) {
      return this._act(t.hash, (c) => c.pause(t.hash));
    },
    resume(t: Torrent) {
      return this._act(t.hash, (c) => c.resume(t.hash));
    },
    forceResume(t: Torrent) {
      return this._act(t.hash, (c) => c.forceResume(t.hash));
    },
    remove(t: Torrent, deleteFiles: boolean) {
      return this._act(t.hash, (c) => c.remove(t.hash, deleteFiles));
    },
    setCategory(t: Torrent, category: string) {
      return this._act(t.hash, (c) => c.setCategory(t.hash, category));
    },

    async add(urls: string, opts: AddTorrentOptions): Promise<boolean> {
      if (!urls.trim()) return false;
      try {
        await this._run((c) => c.addUrls(urls.trim(), opts));
        await this.fetch(true);
        return true;
      } catch {
        return false;
      }
    },
  },
});
