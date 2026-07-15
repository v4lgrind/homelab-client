import { defineStore } from "pinia";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { SERVICES, STORAGE_KEYS } from "@/constants";
import type { AuthType, ServiceId, ServiceState } from "@/types/service";
import { createArrClient } from "@/services/arr";
import { createGlancesClient } from "@/services/glances";
import { createQbitClient, type QbitConfig } from "@/services/qbittorrent";
import { createJellyfinClient } from "@/services/jellyfin";
import { checkPin, createPin, createPlexClient, discoverServers } from "@/services/plex";
import { HttpError } from "@/services/http";

/** Interactive sign-in flows (Jellyfin Quick Connect, Plex PIN). */
export type PairingId = "jellyfin" | "plex";

export interface PairingState {
  active: boolean;
  /** The code the user must approve in Jellyfin. */
  code?: string;
  error?: string;
}

/** Give up rather than poll a stale code forever. */
const PAIRING_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  /** Runtime-only, like apiKeys — passwords for userpass services. */
  passwords: Record<ServiceId, string>;
  /** Runtime-only, like apiKeys — the token the Plex server itself accepts. */
  plexServerToken: string;
  secretsLoaded: boolean;
  pairing: Record<PairingId, PairingState>;
}

export const useConnectionStore = defineStore("connection", {
  state: (): State => ({
    rootDomain: "",
    services: defaultServices(),
    apiKeys: {} as Record<ServiceId, string>,
    passwords: {} as Record<ServiceId, string>,
    plexServerToken: "",
    secretsLoaded: false,
    pairing: { jellyfin: { active: false }, plex: { active: false } },
  }),

  // Persist only non-secret config; API keys live in Preferences.
  persist: {
    pick: ["rootDomain", "services"],
  },

  getters: {
    hasKey: (state) => (id: ServiceId) => !!state.apiKeys[id]?.trim(),
    /** The auth method in effect: the user's pick, else the service's default. */
    authTypeOf:
      (state) =>
      (id: ServiceId): AuthType => {
        const meta = SERVICES.find((s) => s.id === id)!;
        const chosen = state.services[id]?.authType;
        return chosen && meta.authTypes?.includes(chosen) ? chosen : meta.authType;
      },
    /**
     * How to reach qBittorrent right now, or null if it is not configured.
     * Single source of truth for both the connection test and the torrents
     * store, so the two can never disagree about which mode is active.
     */
    qbitConfig(state): QbitConfig | null {
      const svc = state.services.qbittorrent;
      if (this.authTypeOf("qbittorrent") === "proxyurl") {
        const proxyUrl = state.apiKeys.qbittorrent?.trim();
        return proxyUrl ? { mode: "proxy", proxyUrl } : null;
      }
      const username = svc.username?.trim();
      const password = state.passwords.qbittorrent;
      if (!username || !password || !state.rootDomain.trim() || !svc.subdomain.trim()) return null;
      return {
        mode: "direct",
        subdomain: svc.subdomain,
        rootDomain: state.rootDomain,
        username,
        password,
      };
    },
    isConfigured(state): boolean {
      if (!state.rootDomain.trim()) return false;
      return SERVICES.some(
        (s) => s.available && (!!state.apiKeys[s.id]?.trim() || !!state.passwords[s.id]?.trim()),
      );
    },
  },

  actions: {
    async loadSecrets() {
      for (const s of SERVICES) {
        try {
          const { value } = await Preferences.get({ key: STORAGE_KEYS.apiKeyPrefix + s.id });
          if (value) this.apiKeys[s.id] = value;
          const pw = await Preferences.get({ key: STORAGE_KEYS.passwordPrefix + s.id });
          if (pw.value) this.passwords[s.id] = pw.value;
        } catch {
          /* ignore — service simply stays unconfigured */
        }
      }
      try {
        const { value } = await Preferences.get({ key: STORAGE_KEYS.plexServerToken });
        if (value) this.plexServerToken = value;
      } catch {
        /* ignore */
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

    setPassword(id: ServiceId, value: string) {
      this.passwords[id] = value;
      this.services[id].status = "idle";
    },

    /** Switch a service between the auth methods it supports. */
    setAuthType(id: ServiceId, value: AuthType) {
      this.services[id].authType = value;
      this.services[id].status = "idle";
      this.services[id].error = undefined;
      this.services[id].version = undefined;
    },

    async persistApiKey(id: ServiceId) {
      const key = STORAGE_KEYS.apiKeyPrefix + id;
      const value = this.apiKeys[id]?.trim();
      if (value) await Preferences.set({ key, value });
      else await Preferences.remove({ key });
    },

    async persistPassword(id: ServiceId) {
      const key = STORAGE_KEYS.passwordPrefix + id;
      const value = this.passwords[id];
      if (value) await Preferences.set({ key, value });
      else await Preferences.remove({ key });
    },

    /* ---------- Jellyfin Quick Connect ---------- */

    /**
     * Ask Jellyfin for a code, show it, then poll until the user approves it
     * from a session already signed in to Jellyfin. Never touches a password.
     */
    async startQuickConnect(): Promise<boolean> {
      const svc = this.services.jellyfin;
      if (!this.rootDomain.trim() || !svc.subdomain.trim()) {
        this.pairing.jellyfin = { active: false, error: "Domaine et sous-domaine requis" };
        return false;
      }

      this.pairing.jellyfin = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      const client = createJellyfinClient(svc.subdomain, this.rootDomain);
      try {
        if (!(await client.isQuickConnectEnabled())) {
          this.pairing.jellyfin = { active: false, error: "Quick Connect désactivé sur le serveur" };
          svc.status = "error";
          svc.error = "Quick Connect désactivé sur le serveur";
          return false;
        }

        const state = await client.initiateQuickConnect();
        this.pairing.jellyfin = { active: true, code: state.Code };

        const deadline = Date.now() + PAIRING_TIMEOUT_MS;
        while (Date.now() < deadline) {
          // The user cancelled from the UI.
          if (!this.pairing.jellyfin.active) return false;
          await sleep(POLL_INTERVAL_MS);
          const polled = await client.pollQuickConnect(state.Secret);
          if (!polled.Authenticated) continue;

          const auth = await client.authenticateQuickConnect(state.Secret);
          this.apiKeys.jellyfin = auth.AccessToken;
          await this.persistApiKey("jellyfin");
          svc.username = auth.User?.Name;
          this.pairing.jellyfin = { active: false };
          return await this.testService("jellyfin");
        }
        this.pairing.jellyfin = { active: false, error: "Code expiré — réessaie" };
        svc.status = "idle";
        return false;
      } catch (e) {
        const msg = e instanceof HttpError ? e.message : "Échec du Quick Connect";
        this.pairing.jellyfin = { active: false, error: msg };
        svc.status = "error";
        svc.error = msg;
        return false;
      }
    },

    /* ---------- Plex PIN sign-in ---------- */

    /**
     * Open plex.tv's own sign-in page and poll the PIN until it comes back
     * authorised. Credentials only ever go to Plex, never through the app.
     */
    async startPlexAuth(): Promise<boolean> {
      const svc = this.services.plex;
      this.pairing.plex = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      try {
        const { pin, authUrl } = await createPin();
        await Browser.open({ url: authUrl, presentationStyle: "popover" });

        const deadline = Date.now() + PAIRING_TIMEOUT_MS;
        let token: string | undefined;
        while (Date.now() < deadline) {
          if (!this.pairing.plex.active) {
            await Browser.close().catch(() => {});
            return false;
          }
          await sleep(POLL_INTERVAL_MS);
          token = await checkPin(pin.id);
          if (token) break;
        }
        await Browser.close().catch(() => {});

        if (!token) {
          this.pairing.plex = { active: false, error: "Connexion expirée — réessaie" };
          svc.status = "idle";
          return false;
        }

        this.apiKeys.plex = token;
        await this.persistApiKey("plex");
        this.pairing.plex = { active: false };
        return await this.discoverPlex();
      } catch (e) {
        await Browser.close().catch(() => {});
        const msg = e instanceof HttpError ? e.message : "Échec de la connexion Plex";
        this.pairing.plex = { active: false, error: msg };
        svc.status = "error";
        svc.error = msg;
        return false;
      }
    },

    /**
     * Resolve a Plex server address through plex.tv. Also the recovery path when
     * a stored address stops answering — it changes with the network (LAN at
     * home, plex.direct outside).
     */
    async discoverPlex(): Promise<boolean> {
      const svc = this.services.plex;
      const account = this.apiKeys.plex?.trim();
      if (!account) {
        svc.status = "error";
        svc.error = "Connecte-toi à Plex d'abord";
        return false;
      }

      svc.status = "testing";
      try {
        const [server] = await discoverServers(account);
        svc.baseUrl = server.uri;
        svc.serverName = server.name;
        this.plexServerToken = server.accessToken;
        await Preferences.set({ key: STORAGE_KEYS.plexServerToken, value: server.accessToken });
        return await this.testService("plex");
      } catch (e) {
        svc.status = "error";
        svc.error = e instanceof HttpError ? e.message : "Découverte du serveur Plex impossible";
        return false;
      }
    },

    cancelPairing(id: PairingId) {
      this.pairing[id] = { active: false };
      if (this.services[id].status === "testing") this.services[id].status = "idle";
    },

    /** Test one service's connection. */
    async testService(id: ServiceId): Promise<boolean> {
      const svc = this.services[id];
      const auth = this.authTypeOf(id);
      const key = this.apiKeys[id]?.trim();

      if (auth === "proxyurl") {
        if (!key) {
          svc.status = "error";
          svc.error = "URL du proxy qui requise";
          return false;
        }
      } else if (auth === "userpass") {
        if (!this.rootDomain.trim() || !svc.subdomain.trim()) {
          svc.status = "error";
          svc.error = "Domaine et sous-domaine requis";
          return false;
        }
        if (!svc.username?.trim() || !this.passwords[id]) {
          svc.status = "error";
          svc.error = "Identifiant et mot de passe requis";
          return false;
        }
      } else if (auth === "plexauth") {
        if (!key) {
          svc.status = "error";
          svc.error = "Connecte-toi à Plex d'abord";
          return false;
        }
        if (!svc.baseUrl) {
          svc.status = "error";
          svc.error = "Aucun serveur Plex découvert";
          return false;
        }
      } else if (auth === "quickconnect") {
        if (!this.rootDomain.trim() || !svc.subdomain.trim()) {
          svc.status = "error";
          svc.error = "Domaine et sous-domaine requis";
          return false;
        }
        if (!key) {
          svc.status = "error";
          svc.error = "Lance le Quick Connect d'abord";
          return false;
        }
      } else {
        if (!this.rootDomain.trim() || !svc.subdomain.trim()) {
          svc.status = "error";
          svc.error = "Domaine et sous-domaine requis";
          return false;
        }
        if (auth === "apikey" && !key) {
          svc.status = "error";
          svc.error = "Clé API requise";
          return false;
        }
      }

      svc.status = "testing";
      svc.error = undefined;
      try {
        if (auth === "none") {
          // Glances: no key, just check the API answers.
          const client = createGlancesClient(svc.subdomain, this.rootDomain);
          const s = await client.getStats();
          svc.version = s.hostname;
          svc.status = "ok";
          return true;
        }
        if (auth === "proxyurl" || auth === "userpass") {
          // Via qui the URL embeds the key and qui holds the session; direct, we
          // log in ourselves. Either way transfer/info proves we are through.
          if (auth === "proxyurl") await this.persistApiKey(id);
          else await this.persistPassword(id);

          const client = createQbitClient(this.qbitConfig!);
          await client.getTransferInfo();
          const v = await client.getAppVersion().catch(() => undefined);
          svc.version = typeof v === "string" ? v.replace(/^v/i, "") : undefined;
          svc.status = "ok";
          return true;
        }
        if (auth === "quickconnect") {
          const client = createJellyfinClient(svc.subdomain, this.rootDomain, key!);
          const info = await client.getSystemInfo();
          svc.version = info.Version;
          svc.serverName = info.ServerName;
          svc.status = "ok";
          return true;
        }
        if (auth === "plexauth") {
          const client = createPlexClient(svc.baseUrl!, this.plexServerToken || key!);
          const identity = await client.getIdentity();
          svc.version = identity.MediaContainer?.version;
          svc.serverName = identity.MediaContainer?.friendlyName ?? svc.serverName;
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
      this.passwords[id] = "";
      this.services[id] = { subdomain: SERVICES.find((s) => s.id === id)!.defaultSubdomain, status: "idle" };
      await Preferences.remove({ key: STORAGE_KEYS.apiKeyPrefix + id });
      await Preferences.remove({ key: STORAGE_KEYS.passwordPrefix + id });
      if (id === "plex") await this.clearPlexServerToken();
    },

    async resetAll() {
      this.rootDomain = "";
      this.services = defaultServices();
      for (const s of SERVICES) {
        this.apiKeys[s.id] = "";
        this.passwords[s.id] = "";
        await Preferences.remove({ key: STORAGE_KEYS.apiKeyPrefix + s.id });
        await Preferences.remove({ key: STORAGE_KEYS.passwordPrefix + s.id });
      }
      await this.clearPlexServerToken();
    },

    async clearPlexServerToken() {
      this.plexServerToken = "";
      await Preferences.remove({ key: STORAGE_KEYS.plexServerToken });
    },
  },
});
