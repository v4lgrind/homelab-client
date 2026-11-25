import { defineStore } from "pinia";
import { useConnectionStore } from "@/store/connection-store";
import { CertMismatchError, HttpError } from "@/services/http";
import { createPinnedTransport } from "@/services/pinned-transport";
import { createProxmoxClient, type ProxmoxClient } from "@/services/proxmox";
import type { PveSnapshot } from "@/types/proxmox";

const MAX_HISTORY = 40;
/**
 * Proxmox refreshes guest counters (pvestatd) about every 10 s, but we poll
 * every 5 s. A sample whose counters have not moved is the same reading again,
 * unless this long has passed — then the guest really is idle.
 */
const STILL_AFTER_MS = 15000;

export interface NetRate {
  /** Bytes per second. */
  rx: number;
  tx: number;
}

interface State {
  snapshot: PveSnapshot | null;
  /** Per vmid; undefined until two samples exist. */
  rates: Record<number, NetRate | undefined>;
  cpuHistory: number[];
  memHistory: number[];
  state: "idle" | "loading" | "ready" | "error";
  error?: string;
  /** Proxmox presented another certificate than the pinned one. */
  certMismatch?: { expected: string; received: string };
}

// Kept outside the reactive state: a client holds its ticket, and the previous
// sample is only needed to derive rates.
let cached: { key: string; client: ProxmoxClient } | undefined;
let lastSample: { at: number; counters: Map<number, { in: number; out: number }> } | undefined;
/** The refresh under way, so a slow one is not stacked with the next poll. */
let inflight: Promise<void> | undefined;

/** The pin, if it belongs to the address configured now. */
function currentPin(): string | undefined {
  const conn = useConnectionStore();
  const svc = conn.services.proxmox;
  return svc?.certSha256 && svc.certUrl === conn.urlOf("proxmox") ? svc.certSha256 : undefined;
}

function setPin(fp: string) {
  const conn = useConnectionStore();
  conn.services.proxmox.certSha256 = fp;
  conn.services.proxmox.certUrl = conn.urlOf("proxmox");
}

export const useProxmoxStore = defineStore("proxmox", {
  state: (): State => ({ snapshot: null, rates: {}, cpuHistory: [], memHistory: [], state: "idle" }),

  actions: {
    /** The client for the current address and credentials, reused while they hold. */
    client(): ProxmoxClient | null {
      const conn = useConnectionStore();
      const url = conn.urlOf("proxmox");
      const username = conn.services.proxmox?.username?.trim() ?? "";
      const password = conn.passwords.proxmox ?? "";
      if (!url || !username || !password) return null;
      const key = `${url}\n${username}\n${password}`;
      if (cached?.key !== key) {
        // Look the store up on each call rather than closing over `conn`, so the
        // pin always comes from the live config.
        const transport = createPinnedTransport(currentPin, setPin);
        cached = { key, client: createProxmoxClient({ url, username, password, transport }) };
      }
      return cached.client;
    },

    noteMismatch(e: CertMismatchError) {
      this.certMismatch = { expected: currentPin() ?? "", received: e.received };
    },

    /** Signs in afresh (connection test); returns the PVE version. */
    async login(): Promise<string> {
      const client = this.client();
      if (!client) throw new HttpError("Identifiant et mot de passe requis", 0, "auth");
      try {
        const version = await client.login();
        // The certificate answered as pinned: any earlier alert is stale.
        this.certMismatch = undefined;
        return version;
      } catch (e) {
        if (e instanceof CertMismatchError) this.noteMismatch(e);
        throw e;
      }
    },

    fetch(force = false): Promise<void> {
      if (!inflight) {
        inflight = this.refresh(force).finally(() => {
          inflight = undefined;
        });
      }
      return inflight;
    },

    async refresh(force: boolean) {
      // Nothing leaves the app while a changed certificate awaits a decision.
      if (this.certMismatch) return;
      const client = this.client();
      if (!client) {
        this.state = "error";
        this.error = "Proxmox n'est pas configuré";
        return;
      }
      if (this.state === "idle" || (force && !this.snapshot)) this.state = "loading";
      this.error = undefined;
      try {
        const snap = await client.snapshot();
        const now = Date.now();
        const counters = new Map(snap.guests.map((g) => [g.vmid, { in: g.netIn, out: g.netOut }]));
        const prev = lastSample;
        const moved =
          !prev ||
          snap.guests.some((g) => {
            const p = prev.counters.get(g.vmid);
            return !p || p.in !== g.netIn || p.out !== g.netOut;
          });
        if (!prev) {
          lastSample = { at: now, counters };
          this.rates = {};
        } else if (moved || now - prev.at >= STILL_AFTER_MS) {
          const dt = (now - prev.at) / 1000;
          const rates: Record<number, NetRate | undefined> = {};
          for (const g of snap.guests) {
            const p = prev.counters.get(g.vmid);
            if (!p || dt <= 0) continue;
            rates[g.vmid] = {
              rx: Math.max(0, (g.netIn - p.in) / dt),
              tx: Math.max(0, (g.netOut - p.out) / dt),
            };
          }
          lastSample = { at: now, counters };
          this.rates = rates;
        }
        // Otherwise: same counters as last time, keep the rates shown.
        this.snapshot = snap;
        const memPct = snap.node.memTotal ? Math.round((snap.node.memUsed / snap.node.memTotal) * 100) : 0;
        this.cpuHistory = [...this.cpuHistory, snap.node.cpu].slice(-MAX_HISTORY);
        this.memHistory = [...this.memHistory, memPct].slice(-MAX_HISTORY);
        this.state = "ready";
      } catch (e) {
        if (e instanceof CertMismatchError) {
          this.noteMismatch(e);
          if (!this.snapshot) this.state = "error";
          return;
        }
        // Keep the last snapshot on a transient background failure.
        if (!this.snapshot) {
          this.state = "error";
          this.error = e instanceof HttpError ? e.message : "Erreur de chargement";
        }
      }
    },

    /** Accepts the certificate Proxmox now presents, then reloads. */
    async trustNewCert() {
      if (!this.certMismatch) return;
      // Only replace the pin the alert was about: if it changed meanwhile (new
      // address, Settings test), the alert is stale and just goes away.
      if (currentPin() === this.certMismatch.expected) setPin(this.certMismatch.received);
      this.certMismatch = undefined;
      await this.fetch(true);
    },

    async guestIp(vmid: number): Promise<string | undefined> {
      const snap = this.snapshot;
      const g = snap?.guests.find((x) => x.vmid === vmid);
      const client = this.client();
      if (!snap || !g || !client || this.certMismatch) return undefined;
      return client.guestIp(g, snap.node.node);
    },

    reset() {
      cached = undefined;
      lastSample = undefined;
      inflight = undefined;
      this.snapshot = null;
      this.rates = {};
      this.cpuHistory = [];
      this.memHistory = [];
      this.state = "idle";
      this.error = undefined;
      this.certMismatch = undefined;
    },
  },
});
