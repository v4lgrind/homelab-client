import { defineStore } from "pinia";
import { Preferences } from "@capacitor/preferences";
import { SERVICES, STORAGE_KEYS } from "@/constants";
import type { ServiceId, ServiceState } from "@/types/service";
import { createArrClient } from "@/services/arr";
import { createGlancesClient } from "@/services/glances";
import { createQbitClient } from "@/services/qbittorrent";
import { HttpError } from "@/services/http";

function defaultServices(): Record<ServiceId, ServiceState> {
  const out = {} as Record<ServiceId, ServiceState>;
  for (const s of SERVICES) {
    out[s.id] = { subdomain: s.defaultSubdomain, status: "idle" };
  }
  return out;
}

interface State {
  rootDomain: string;
  services: Record<ServiceId, ServiceState>;
  /** Runtime-only; loaded from / saved to Preferences (never persisted by pinia). */
  apiKeys: Record<ServiceId, string>;
  secretsLoaded: boolean;
}

export const useConnectionStore = defineStore("connection", {
  state: (): State => ({
    rootDomain: "",
    services: defaultServices(),
    apiKeys: {} as Record<ServiceId, string>,
    secretsLoaded: false,
  }),

  // Persist only non-secret config; API keys live in Preferences.
  persist: {
    pick: ["rootDomain", "services"],
  },

  getters: {
    hasKey: (state) => (id: ServiceId) => !!state.apiKeys[id]?.trim(),
    isConfigured(state): boolean {
      if (!state.rootDomain.trim()) return false;
      return SERVICES.some((s) => s.available && !!state.apiKeys[s.id]?.trim());
    },
  },

  actions: {
    async loadSecrets() {
      for (const s of SERVICES) {
        try {
          const { value } = await Preferences.get({ key: STORAGE_KEYS.apiKeyPrefix + s.id });
          if (value) this.apiKeys[s.id] = value;
        } catch {
          /* ignore — service simply stays unconfigured */
        }
      }
      this.secretsLoaded = true;
    },

    setRootDomain(value: string) {
      this.rootDomain = value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    },

    setSubdomain(id: ServiceId, value: string) {
      this.services[id].subdomain = value.trim().replace(/\.+$/, "");
      this.services[id].status = "idle";
    },

    setApiKey(id: ServiceId, value: string) {
      this.apiKeys[id] = value.trim();
      this.services[id].status = "idle";
    },

    setUsername(id: ServiceId, value: string) {
      this.services[id].username = value.trim();
      this.services[id].status = "idle";
    },

    async persistApiKey(id: ServiceId) {
      const key = STORAGE_KEYS.apiKeyPrefix + id;
      const value = this.apiKeys[id]?.trim();
      if (value) await Preferences.set({ key, value });
      else await Preferences.remove({ key });
    },

    /** Test one service's connection. */
    async testService(id: ServiceId): Promise<boolean> {
      const svc = this.services[id];
      const meta = SERVICES.find((s) => s.id === id)!;
      const key = this.apiKeys[id]?.trim();

      if (!this.rootDomain.trim() || !svc.subdomain.trim()) {
        svc.status = "error";
        svc.error = "Domaine et sous-domaine requis";
        return false;
      }
      if (meta.authType === "apikey" && !key) {
        svc.status = "error";
        svc.error = "Clé API requise";
        return false;
      }
      if (meta.authType === "userpass" && (!svc.username?.trim() || !key)) {
        svc.status = "error";
        svc.error = "Utilisateur et mot de passe requis";
        return false;
      }

      svc.status = "testing";
      svc.error = undefined;
      try {
        if (meta.authType === "none") {
          // Glances: no key, just check the API answers.
          const client = createGlancesClient(svc.subdomain, this.rootDomain);
          const s = await client.getStats();
          svc.version = s.hostname;
          svc.status = "ok";
          return true;
        }
        if (meta.authType === "userpass") {
          // qBittorrent: login with username + password (password stored as key).
          await this.persistApiKey(id);
          const client = createQbitClient(svc.subdomain, this.rootDomain);
          await client.login(svc.username!.trim(), key!);
          svc.version = await client.getAppVersion().catch(() => undefined);
          svc.status = "ok";
          return true;
        }
        await this.persistApiKey(id);
        const client = createArrClient(id, svc.subdomain, this.rootDomain, key!);
        const status = await client.getSystemStatus();
        svc.version = status.version;
        svc.status = "ok";
        return true;
      } catch (e) {
        svc.status = "error";
        svc.error = e instanceof HttpError ? e.message : "Échec de la connexion";
        return false;
      }
    },

    async resetService(id: ServiceId) {
      this.apiKeys[id] = "";
      this.services[id] = { subdomain: SERVICES.find((s) => s.id === id)!.defaultSubdomain, status: "idle" };
      await Preferences.remove({ key: STORAGE_KEYS.apiKeyPrefix + id });
    },

    async resetAll() {
      this.rootDomain = "";
      this.services = defaultServices();
      for (const s of SERVICES) {
        this.apiKeys[s.id] = "";
        await Preferences.remove({ key: STORAGE_KEYS.apiKeyPrefix + s.id });
      }
    },
  },
});
