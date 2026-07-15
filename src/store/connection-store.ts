import { defineStore } from "pinia";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
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
  // No error field: failures go to the service's own status/error, which the
  // card already renders. Two channels for one message showed it twice.
}

/** Give up rather than poll a stale code forever. */
const PAIRING_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2500;
/**
 * How long to keep asking plex.tv about the PIN once the user is back in the
 * app. Plex marks a PIN authorised the moment they approve it, so the first
 * poll normally answers; this window only exists to ride out a hiccup.
 */
const PIN_GRACE_MS = 8000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve once the user is back in the app after the sign-in page, or false if
 * they never come back.
 *
 * Android denies a backgrounded app DNS resolution, so nothing networked can
 * run while that page is in front — the user returning is the only reliable
 * signal we have.
 *
 * Do not simplify this to "is the app active?": Browser.open resolves before
 * the tab actually reaches the front, so the app still reads as active for a
 * moment and we would conclude they had already returned.
 */
function waitForReturn(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const handles: PluginListenerHandle[] = [];
    let settled = false;
    let left = false;

    const finish = (returned: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handles.forEach((h) => h.remove());
      resolve(returned);
    };
    const track = (p: Promise<PluginListenerHandle>) => {
      // A listener can fire before addListener resolves; do not leak its handle.
      p.then((h) => {
        if (settled) h.remove();
        else handles.push(h);
      });
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    // The tab was dismissed — they are back, whatever the app state says yet.
    track(Browser.addListener("browserFinished", () => finish(true)));

    track(
      App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) left = true;
        else if (left) finish(true);
      }),
    );
  });
}

/** Ask plex.tv about the PIN until it yields a token or the deadline passes. */
async function pollPin(id: number, deadline: number): Promise<string | undefined> {
  for (;;) {
    try {
      const token = await checkPin(id);
      if (token) return token;
    } catch {
      // Ride out transient failures: the deadline is the only way out, so a
      // single bad request can never tear the sign-in down.
    }
    if (Date.now() >= deadline) return undefined;
    await sleep(POLL_INTERVAL_MS);
  }
}

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
    /**
     * The hostname a service actually lives at: its own override if it has one,
     * otherwise subdomain + root domain. Empty when neither is usable.
     */
    hostOf:
      (state) =>
      (id: ServiceId): string => {
        const svc = state.services[id];
        const override = svc?.host?.trim();
        if (override) return override;
        const sub = svc?.subdomain?.trim();
        const root = state.rootDomain.trim();
        return sub && root ? `${sub}.${root}` : "";
      },
    /** Whether the service is pinned to a host of its own. */
    hasHostOverride: (state) => (id: ServiceId) => !!state.services[id]?.host?.trim(),
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
      const host = this.hostOf("qbittorrent");
      if (!username || !password || !host) return null;
      return { mode: "direct", host, username, password };
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

    setRootDomain(value: string) {
      this.rootDomain = value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    },

    setSubdomain(id: ServiceId, value: string) {
      this.services[id].subdomain = value.trim().replace(/\.+$/, "");
      this.services[id].status = "idle";
    },

    /** Pin a service to its own hostname, independent of the root domain. */
    setHost(id: ServiceId, value: string) {
      const host = value
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");
      this.services[id].host = host || undefined;
      this.services[id].status = "idle";
    },

    /** Drop the override and fall back to subdomain + root domain. */
    clearHost(id: ServiceId) {
      this.services[id].host = undefined;
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
      const host = this.hostOf("jellyfin");

      const fail = (error: string) => {
        this.pairing.jellyfin = { active: false };
        svc.status = "error";
        svc.error = error;
        return false;
      };

      if (!host) return fail("Domaine du service requis");

      this.pairing.jellyfin = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      const client = createJellyfinClient(host);
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
      const host = this.hostOf("jellyfin");
      if (!host) throw new HttpError("Domaine du service requis", 0, "unknown");

      const username = svc.username?.trim();
      const password = this.passwords.jellyfin;
      if (!username || !password) {
        throw new HttpError("Identifiant et mot de passe requis", 0, "auth");
      }

      const client = createJellyfinClient(host);
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

    /* ---------- Plex PIN sign-in ---------- */

    /**
     * Open plex.tv's own sign-in page, wait for the user to come back, then
     * collect the token. Credentials only ever go to Plex, never through the app.
     *
     * The page is deliberately never closed from under the user. An earlier
     * version polled the PIN while the sign-in page was in front and closed the
     * browser on any failure — but a backgrounded app gets no DNS on Android, so
     * every one of those polls failed and the page shut itself mid-password.
     */
    async startPlexAuth(): Promise<boolean> {
      const svc = this.services.plex;

      const fail = (error: string) => {
        this.pairing.plex = { active: false };
        svc.status = "error";
        svc.error = error;
        return false;
      };

      this.pairing.plex = { active: true };
      svc.status = "testing";
      svc.error = undefined;

      try {
        const { pin, authUrl } = await createPin();
        await Browser.open({ url: authUrl });

        // Returning to the app is the signal: either they approved and came
        // back, or they gave up. Both end the wait; only the PIN tells us which.
        const returned = await waitForReturn(PAIRING_TIMEOUT_MS);
        if (!this.pairing.plex.active) return false;
        if (!returned) return fail("Connexion expirée — réessaie");

        // Now that we are foreground again, the network works.
        const token = await pollPin(pin.id, Date.now() + PIN_GRACE_MS);
        // Tidy up the tab only once we no longer need the user in it.
        await Browser.close().catch(() => {});
        if (!token) return fail("Connexion Plex non terminée — réessaie");

        this.apiKeys.plex = token;
        await this.persistApiKey("plex");
        this.pairing.plex = { active: false };
        return await this.discoverPlex();
      } catch (e) {
        return fail(e instanceof HttpError ? e.message : "Échec de la connexion Plex");
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
      const host = this.hostOf(id);

      const fail = (error: string) => {
        svc.status = "error";
        svc.error = error;
        return false;
      };

      // Everything but the two self-addressing methods needs a hostname: the qui
      // proxy URL is already absolute, and Plex learns its address from plex.tv.
      if (auth !== "proxyurl" && auth !== "plexauth" && !host) {
        return fail("Domaine du service requis");
      }
      if (auth === "proxyurl" && !key) return fail("URL du proxy qui requise");
      if (auth === "apikey" && !key) return fail("Clé API requise");
      if (auth === "userpass" && (!svc.username?.trim() || !this.passwords[id])) {
        return fail("Identifiant et mot de passe requis");
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
          const client = createGlancesClient(host);
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
          const client = createJellyfinClient(host, token);
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
        const client = createArrClient(id, host, key!);
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
