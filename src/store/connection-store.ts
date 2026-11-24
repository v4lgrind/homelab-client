import { defineStore } from "pinia";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { SERVICES, STORAGE_KEYS } from "@/constants";
import type { AuthType, ServiceId, ServiceState } from "@/types/service";
import { createArrClient } from "@/services/arr";
import { createGlancesClient } from "@/services/glances";
import { createQbitClient, type QbitConfig } from "@/services/qbittorrent";
import { createJellyfinClient } from "@/services/jellyfin";
import { checkPin, connectServer, createPin, createPlexClient, listServers } from "@/services/plex";
import type { PlexResource } from "@/types/media";
import { HttpError } from "@/services/http";
import { SERVICE_URL_ERROR, normalizeServiceUrl } from "@/lib/service-url";
import { migrateHydratedState } from "@/store/migrate-address";

/** Interactive sign-in flows (Jellyfin Quick Connect, Plex PIN). */
export type PairingId = "jellyfin" | "plex";

export interface PairingState {
  active: boolean;
  /** The code the user must approve in Jellyfin. */
  code?: string;
  // No error field: failures go to the service's own status/error, which the
  // card already renders. Two channels for one message showed it twice.
}

/** Give up rather than poll a stale code forever. */
const PAIRING_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;
/**
 * Identifies the current Plex sign-in attempt. A cancel followed by a restart
 * within one poll interval leaves the old loop asleep; on waking it must see it
 * has been superseded rather than poll on, and never fail the new attempt.
 */
let plexRun = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function defaultServices(): Record<ServiceId, ServiceState> {
  const out = {} as Record<ServiceId, ServiceState>;
  for (const s of SERVICES) {
    out[s.id] = { status: "idle" };
  }
  return out;
}

interface State {
  services: Record<ServiceId, ServiceState>;
  /** Runtime-only; loaded from / saved to Preferences (never persisted by pinia). */
  apiKeys: Record<ServiceId, string>;
  /** Runtime-only, like apiKeys — passwords for userpass services. */
  passwords: Record<ServiceId, string>;
  /** Runtime-only, like apiKeys — the token the Plex server itself accepts. */
  plexServerToken: string;
  secretsLoaded: boolean;
  pairing: Record<PairingId, PairingState>;
  /** Runtime-only: Plex servers offered for the user to pick from. */
  plexChoices: PlexResource[];
}

export const useConnectionStore = defineStore("connection", {
  state: (): State => ({
    services: defaultServices(),
    apiKeys: {} as Record<ServiceId, string>,
    passwords: {} as Record<ServiceId, string>,
    plexServerToken: "",
    secretsLoaded: false,
    pairing: { jellyfin: { active: false }, plex: { active: false } },
    plexChoices: [],
  }),

  // Persist only non-secret config; API keys live in Preferences.
  persist: {
    // rootDomain is no longer state, but it must be picked so a legacy value
    // reaches afterHydrate (the plugin applies pick to what it reads back);
    // the migration then deletes it and the next save drops it.
    pick: ["services", "rootDomain"],
    // Older versions persisted rootDomain + subdomain/host: fold them into a
    // full url per service.
    afterHydrate: (ctx) => migrateHydratedState(ctx.store.$state as unknown as Record<string, unknown>),
  },

  getters: {
    hasKey: (state) => (id: ServiceId) => !!state.apiKeys[id]?.trim(),
    /** The service's address, normalised; "" when blank or invalid. */
    urlOf:
      (state) =>
      (id: ServiceId): string =>
        normalizeServiceUrl(state.services[id]?.url ?? "") ?? "",
    /** Error to show under the address field, if what was typed is unusable. */
    urlError:
      (state) =>
      (id: ServiceId): string | undefined =>
        normalizeServiceUrl(state.services[id]?.url ?? "") === null ? SERVICE_URL_ERROR : undefined,
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
      const url = this.urlOf("qbittorrent");
      if (!url) return null;
      // Both or neither: a lone half is caught by testService with a message.
      return { mode: "direct", url, username: username || undefined, password: password || undefined };
    },
    isConfigured(state): boolean {
      // No root domain requirement: a service may carry its own host.
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

    /**
     * Store the address exactly as typed: this runs on every keystroke
     * (v-model), so normalising here would eat the "/" of "http:/" mid-word.
     * `urlOf` normalises on read.
     */
    setUrl(id: ServiceId, value: string) {
      this.services[id].url = value.trim() || undefined;
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
      const url = this.urlOf("jellyfin");

      const fail = (error: string) => {
        this.pairing.jellyfin = { active: false };
        svc.status = "error";
        svc.error = error;
        return false;
      };

      if (!url) return fail("Adresse du service requise");

      this.pairing.jellyfin = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      const client = createJellyfinClient(url);
      try {
        if (!(await client.isQuickConnectEnabled())) {
          return fail("Quick Connect désactivé sur le serveur");
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
        return fail("Code expiré — réessaie");
      } catch (e) {
        return fail(e instanceof HttpError ? e.message : "Échec du Quick Connect");
      }
    },

    /**
     * Sign in to Jellyfin with a username and password, for servers that have
     * Quick Connect switched off. Yields the same access token, so it is also
     * the recovery path when a stored token stops being accepted.
     */
    async loginJellyfin(): Promise<string> {
      const svc = this.services.jellyfin;
      const url = this.urlOf("jellyfin");
      if (!url) throw new HttpError("Adresse du service requise", 0, "unknown");

      const username = svc.username?.trim();
      const password = this.passwords.jellyfin;
      if (!username || !password) {
        throw new HttpError("Identifiant et mot de passe requis", 0, "auth");
      }

      const client = createJellyfinClient(url);
      const auth = await client.authenticateByName(username, password).catch((e) => {
        // The generic 401 wording talks about an API key, which is not what the
        // user just typed.
        if (e instanceof HttpError && e.kind === "auth") {
          throw new HttpError("Identifiant ou mot de passe refusé", e.status, "auth");
        }
        throw e;
      });
      this.apiKeys.jellyfin = auth.AccessToken;
      await this.persistApiKey("jellyfin");
      await this.persistPassword("jellyfin");
      return auth.AccessToken;
    },

    /* ---------- Plex sign-in by code (plex.tv/link) ---------- */

    /**
     * Show a short code the user types at plex.tv/link, from any device, and
     * poll plex.tv until it is linked. Credentials only ever go to Plex.
     *
     * A network error does not end the wait: if the user switches to the
     * browser on this phone, Android cuts the backgrounded app off the network,
     * and polling simply resumes when they come back.
     */
    async startPlexAuth(): Promise<boolean> {
      const svc = this.services.plex;
      const run = ++plexRun;
      const superseded = () => run !== plexRun || !this.pairing.plex.active;

      const fail = (error: string) => {
        if (run !== plexRun) return false;
        this.pairing.plex = { active: false };
        svc.status = "error";
        svc.error = error;
        return false;
      };

      this.pairing.plex = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      try {
        const pin = await createPin();
        if (superseded()) return false;
        this.pairing.plex = { active: true, code: pin.code };

        const deadline = Date.now() + (pin.expiresIn ? pin.expiresIn * 1000 : PAIRING_TIMEOUT_MS);
        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL_MS);
          // Cancelled from the UI, or replaced by a newer attempt.
          if (superseded()) return false;
          let token: string | undefined;
          try {
            token = await checkPin(pin.id);
          } catch (e) {
            if (e instanceof HttpError && e.kind === "network") continue;
            throw e;
          }
          if (!token) continue;
          if (superseded()) return false;

          // They may have linked from the browser on this phone: put it away.
          await Browser.close().catch(() => {});
          this.apiKeys.plex = token;
          await this.persistApiKey("plex");
          this.pairing.plex = { active: false };
          return await this.discoverPlex();
        }
        return fail("Code expiré — réessaie");
      } catch (e) {
        return fail(e instanceof HttpError ? e.message : "Échec de la connexion Plex");
      }
    },

    /** For a user with only this phone: open the page the code goes into. */
    async openPlexLink() {
      await Browser.open({ url: "https://plex.tv/link" });
    },

    /**
     * After sign-in (or to recover a lost address): settle on the Plex server.
     * The remembered one if the account still sees it, the only one if there is
     * a single server, otherwise offer the list (plexChoices) and let the user
     * pick — the account may see servers shared with it, not just its own.
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
      svc.error = undefined;
      try {
        const servers = await listServers(account);
        if (!servers.length) {
          svc.status = "error";
          svc.error = "Aucun serveur Plex sur ce compte";
          return false;
        }
        const pick =
          servers.find((s) => s.clientIdentifier === svc.serverId) ??
          (servers.length === 1 ? servers[0] : undefined);
        if (!pick) {
          this.plexChoices = servers;
          svc.status = "idle";
          return false;
        }
        return await this.selectPlexServer(pick.clientIdentifier, servers);
      } catch (e) {
        svc.status = "error";
        svc.error = e instanceof HttpError ? e.message : "Découverte du serveur Plex impossible";
        return false;
      }
    },

    /** Connect to one server (probing only its addresses) and remember it. */
    async selectPlexServer(id: string, servers?: PlexResource[]): Promise<boolean> {
      const svc = this.services.plex;
      const resource = (servers ?? this.plexChoices).find((s) => s.clientIdentifier === id);
      const account = this.apiKeys.plex?.trim();
      if (!resource || !account) return false;

      this.plexChoices = [];
      svc.status = "testing";
      svc.error = undefined;
      try {
        const server = await connectServer(resource, account);
        svc.serverId = server.clientIdentifier;
        svc.baseUrl = server.uri;
        svc.serverName = server.name;
        this.plexServerToken = server.accessToken;
        await Preferences.set({ key: STORAGE_KEYS.plexServerToken, value: server.accessToken });
        return await this.testService("plex");
      } catch (e) {
        svc.status = "error";
        svc.error = e instanceof HttpError ? e.message : "Connexion au serveur Plex impossible";
        return false;
      }
    },

    /** Offer the server list again, without a new plex.tv code. */
    async changePlexServer() {
      const account = this.apiKeys.plex?.trim();
      if (!account) return;
      try {
        this.plexChoices = await listServers(account);
      } catch (e) {
        this.services.plex.error = e instanceof HttpError ? e.message : "Liste des serveurs Plex indisponible";
      }
    },

    /** Close the server list. An already connected server stays as it was. */
    cancelPlexChoice() {
      this.plexChoices = [];
      const svc = this.services.plex;
      if (!svc.baseUrl) svc.status = "idle";
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
      const url = this.urlOf(id);

      const fail = (error: string) => {
        svc.status = "error";
        svc.error = error;
        return false;
      };

      // Everything but the two self-addressing methods needs a hostname: the qui
      // proxy URL is already absolute, and Plex learns its address from plex.tv.
      if (auth !== "proxyurl" && auth !== "plexauth" && !url) {
        return fail("Adresse du service requise");
      }
      if (auth === "proxyurl" && !key) return fail("URL du proxy qui requise");
      if (auth === "apikey" && !key) return fail("Clé API requise");
      if (auth === "userpass") {
        const hasUser = !!svc.username?.trim();
        const hasPassword = !!this.passwords[id];
        // qBittorrent may need no login at all (whitelisted subnet); Jellyfin
        // always does.
        if (id === "qbittorrent" && hasUser !== hasPassword) {
          return fail("Identifiant et mot de passe vont ensemble");
        }
        if (id !== "qbittorrent" && (!hasUser || !hasPassword)) {
          return fail("Identifiant et mot de passe requis");
        }
      }
      if (auth === "quickconnect" && !key) return fail("Lance le Quick Connect d'abord");
      if (auth === "plexauth") {
        if (!key) return fail("Connecte-toi à Plex d'abord");
        if (!svc.baseUrl) return fail("Aucun serveur Plex découvert");
      }

      svc.status = "testing";
      svc.error = undefined;
      try {
        if (auth === "none") {
          // Glances: no key, just check the API answers.
          const client = createGlancesClient(url);
          const s = await client.getStats();
          svc.version = s.hostname;
          svc.status = "ok";
          return true;
        }
        // Both qBittorrent and Jellyfin can be userpass, so branch on the
        // service here rather than on the auth method alone.
        if (id === "qbittorrent") {
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
        if (id === "jellyfin") {
          // Quick Connect already yielded a token; userpass gets one now.
          const token = auth === "userpass" ? await this.loginJellyfin() : key!;
          const client = createJellyfinClient(url, token);
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
        const client = createArrClient(id, url, key!);
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
      this.services[id] = { status: "idle" };
      await Preferences.remove({ key: STORAGE_KEYS.apiKeyPrefix + id });
      await Preferences.remove({ key: STORAGE_KEYS.passwordPrefix + id });
      if (id === "plex") await this.clearPlexServerToken();
    },

    async resetAll() {
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
