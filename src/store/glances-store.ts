import { defineStore } from "pinia";
import { createGlancesClient } from "@/services/glances";
import { useConnectionStore } from "@/store/connection-store";
import { HttpError } from "@/services/http";
import type { GlancesStats } from "@/types/glances";

const MAX_HISTORY = 40;

interface State {
  stats: GlancesStats | null;
  cpuHistory: number[];
  memHistory: number[];
  state: "idle" | "loading" | "ready" | "error";
  error?: string;
}

export const useGlancesStore = defineStore("glances", {
  state: (): State => ({ stats: null, cpuHistory: [], memHistory: [], state: "idle" }),

  actions: {
    async fetch(force = false) {
      const conn = useConnectionStore();
      const host = conn.hostOf("glances");
      if (!host) {
        this.state = "error";
        this.error = "Glances n'est pas configuré";
        return;
      }
      if (this.state === "idle" || (force && !this.stats)) this.state = "loading";
      this.error = undefined;
      try {
        const client = createGlancesClient(host);
        const stats = await client.getStats();
        this.stats = stats;
        this.cpuHistory = [...this.cpuHistory, stats.cpu].slice(-MAX_HISTORY);
        this.memHistory = [...this.memHistory, stats.memPercent].slice(-MAX_HISTORY);
        this.state = "ready";
      } catch (e) {
        // Keep the last snapshot on a transient background failure.
        if (!this.stats) {
          this.state = "error";
          this.error = e instanceof HttpError ? e.message : "Erreur de chargement";
        }
      }
    },

    reset() {
      this.stats = null;
      this.cpuHistory = [];
      this.memHistory = [];
      this.state = "idle";
      this.error = undefined;
    },
  },
});
