import { defineStore } from "pinia";
import { Preferences } from "@capacitor/preferences";
import { STORAGE_KEYS } from "@/constants";
import { createHubClient, hubStreamUrl } from "@/services/hub";
import { HttpError } from "@/services/http";
import type { HubNotification } from "@/types/notification";

type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * The live SSE connection, kept outside the store state: an EventSource is not
 * serialisable and must never end up in persisted state.
 */
let eventSource: EventSource | undefined;
/** Callback fired for each genuinely new notification (native-notif hook). */
let onIncoming: ((n: HubNotification) => void) | undefined;

/** Register a handler for newly arrived notifications (see native notifications). */
export function onHubNotification(cb: (n: HubNotification) => void) {
  onIncoming = cb;
}

interface State {
  /** Hub base URL, e.g. https://hub.valgrind.cloud (persisted, non-secret). */
  hubUrl: string;
  /** Bearer token — runtime only, loaded from / saved to Preferences. */
  token: string;
  tokenLoaded: boolean;
  /** Cached history, so the list and unread badge survive a cold start. */
  notifications: HubNotification[];
  /** Highest id the user has seen; anything above it is unread. */
  lastSeenId: number;
  state: LoadState;
  error?: string;
  /** Whether the live SSE stream is currently connected. */
  connected: boolean;
}

export const useNotificationsStore = defineStore("notifications", {
  state: (): State => ({
    hubUrl: "",
    token: "",
    tokenLoaded: false,
    notifications: [],
    lastSeenId: 0,
    state: "idle",
    connected: false,
  }),

  // Persist the non-secret config + the cache; the token lives in Preferences.
  persist: {
    pick: ["hubUrl", "notifications", "lastSeenId"],
  },

  getters: {
    configured: (state) => !!state.hubUrl.trim() && !!state.token.trim(),
    unreadCount: (state) => state.notifications.filter((n) => n.id > state.lastSeenId).length,
    isUnread: (state) => (n: HubNotification) => n.id > state.lastSeenId,
  },

  actions: {
    async loadToken() {
      try {
        const { value } = await Preferences.get({ key: STORAGE_KEYS.hubToken });
        if (value) this.token = value;
      } catch {
        /* ignore — hub simply stays unconfigured */
      }
      this.tokenLoaded = true;
    },

    setHubUrl(value: string) {
      this.hubUrl = value.trim().replace(/\/+$/, "");
    },

    async setToken(value: string) {
      this.token = value.trim();
      if (this.token) await Preferences.set({ key: STORAGE_KEYS.hubToken, value: this.token });
      else await Preferences.remove({ key: STORAGE_KEYS.hubToken });
    },

    /** Pull the latest notifications from the hub. Keeps the cache on failure. */
    async fetch() {
      if (!this.configured) return;
      this.state = "loading";
      this.error = undefined;
      try {
        const client = createHubClient(this.hubUrl, this.token);
        const { notifications } = await client.getNotifications();
        this.notifications = notifications;
        this.state = "ready";
      } catch (e) {
        this.state = "error";
        this.error = e instanceof HttpError ? e.message : "Hub injoignable";
      }
    },

    /** Verify the hub answers with the current URL + token. */
    async test(): Promise<boolean> {
      if (!this.hubUrl.trim() || !this.token.trim()) return false;
      try {
        const client = createHubClient(this.hubUrl, this.token);
        // getNotifications is bearer-guarded, so it proves the token too.
        await client.getNotifications();
        await this.fetch();
        return true;
      } catch (e) {
        this.error = e instanceof HttpError ? e.message : "Hub injoignable";
        return false;
      }
    },

    /** Merge a notification arriving live, newest-first, without duplicating. */
    ingest(n: HubNotification) {
      if (this.notifications.some((x) => x.id === n.id)) return;
      this.notifications = [n, ...this.notifications];
      onIncoming?.(n);
    },

    /**
     * Open the live SSE stream. Idempotent; the browser's EventSource reconnects
     * on its own (the server sends a retry hint), so we only track the state.
     */
    connect() {
      if (!this.configured || eventSource) return;
      const es = new EventSource(hubStreamUrl(this.hubUrl, this.token));
      eventSource = es;
      es.onopen = () => {
        this.connected = true;
      };
      es.onmessage = (e) => {
        try {
          this.ingest(JSON.parse(e.data) as HubNotification);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        // EventSource retries automatically; just reflect the dropped state.
        this.connected = false;
      };
    },

    disconnect() {
      eventSource?.close();
      eventSource = undefined;
      this.connected = false;
    },

    /** Reconnect after a config change, so a new URL/token takes effect. */
    reconnect() {
      this.disconnect();
      this.connect();
    },

    markAllRead() {
      this.lastSeenId = this.notifications.reduce((max, n) => Math.max(max, n.id), this.lastSeenId);
    },

    async reset() {
      this.disconnect();
      this.hubUrl = "";
      this.notifications = [];
      this.lastSeenId = 0;
      this.state = "idle";
      await this.setToken("");
    },
  },
});
