import { defineStore } from "pinia";
import { arrClientFor } from "@/services/arr-factory";
import { HttpError } from "@/services/http";
import type { MediaKind, Release } from "@/types/arr";

type LoadState = "idle" | "loading" | "ready" | "error";

interface State {
  releases: Release[];
  state: LoadState;
  error?: string;
  grabbingGuid: string | null;
  grabbedGuids: string[];
  grabError?: string;
}

export const useSearchStore = defineStore("search", {
  state: (): State => ({
    releases: [],
    state: "idle",
    grabbingGuid: null,
    grabbedGuids: [],
  }),

  actions: {
    async search(kind: MediaKind, params: Record<string, string | number>) {
      this.state = "loading";
      this.error = undefined;
      this.releases = [];
      this.grabbedGuids = [];
      try {
        const client = arrClientFor(kind);
        const releases = await client.getReleases(params);
        // Show acceptable releases first, then by seeders (torrents) descending.
        this.releases = releases.slice().sort((a, b) => {
          if (!!a.rejected !== !!b.rejected) return a.rejected ? 1 : -1;
          return (b.seeders ?? -1) - (a.seeders ?? -1);
        });
        this.state = "ready";
      } catch (e) {
        this.state = "error";
        this.error = e instanceof HttpError ? e.message : "Échec de la recherche";
      }
    },

    async grab(kind: MediaKind, r: Release): Promise<boolean> {
      if (this.grabbingGuid || !r.indexerId) return false;
      this.grabbingGuid = r.guid;
      this.grabError = undefined;
      try {
        const client = arrClientFor(kind);
        await client.grabRelease(r.guid, r.indexerId);
        this.grabbedGuids.push(r.guid);
        return true;
      } catch (e) {
        this.grabError = e instanceof HttpError ? e.message : "Échec de l'envoi";
        return false;
      } finally {
        this.grabbingGuid = null;
      }
    },
  },
});
