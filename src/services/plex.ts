import { Preferences } from "@capacitor/preferences";
import { ServiceHttp, HttpError } from "@/services/http";
import { CLIENT_INFO } from "@/constants";
import type {
  PlexConnection,
  PlexIdentity,
  PlexPin,
  PlexResource,
  PlexServer,
  PlexSessionsResponse,
} from "@/types/media";

const PLEX_TV = "https://plex.tv/api/v2";
const CLIENT_ID_KEY = "homelab_plex_client_id";

/**
 * Plex ties a PIN to the client identifier that created it, and later reuses it
 * to recognise this device in the account's authorised-devices list. Generate
 * once, then reuse forever.
 */
async function clientId(): Promise<string> {
  const { value } = await Preferences.get({ key: CLIENT_ID_KEY });
  if (value) return value;
  const id = crypto.randomUUID();
  await Preferences.set({ key: CLIENT_ID_KEY, value: id });
  return id;
}

/** Identifies the app to plex.tv; shown in the user's authorised devices. */
async function plexHeaders(): Promise<Record<string, string>> {
  return {
    "X-Plex-Product": CLIENT_INFO.name,
    "X-Plex-Version": CLIENT_INFO.version,
    "X-Plex-Client-Identifier": await clientId(),
    "X-Plex-Device": CLIENT_INFO.device,
    "X-Plex-Platform": CLIENT_INFO.device,
  };
}

/* ---------- account: PIN sign-in flow ---------- */

/**
 * Step 1 — ask plex.tv for a short code (not a "strong" PIN): the 4-character
 * kind the user types at plex.tv/link, from any device. Step 2 polls until that
 * happens. No browser round-trip, so the app stays in front and can keep
 * polling (Android cuts a backgrounded app off the network).
 */
export async function createPin(): Promise<PlexPin> {
  const http = new ServiceHttp(PLEX_TV, "", "X-Plex-Token");
  return http.request<PlexPin>("/pins", {
    method: "POST",
    params: { strong: false },
    headers: await plexHeaders(),
  });
}

/**
 * Step 2 — poll a PIN. Returns the account token once the user has signed in,
 * or undefined while still pending.
 */
export async function checkPin(id: number): Promise<string | undefined> {
  const http = new ServiceHttp(PLEX_TV, "", "X-Plex-Token");
  const pin = await http.get<PlexPin>(`/pins/${id}`, { headers: await plexHeaders() });
  return pin.authToken ?? undefined;
}

/* ---------- discovery ---------- */

/**
 * Prefer connections likely to be both fast and reachable: a direct address
 * beats a relay (relays are bandwidth-capped by Plex), and among direct ones a
 * LAN address beats a WAN round-trip.
 */
function rank(c: PlexConnection): number {
  if (c.relay) return 3;
  return c.local ? 0 : 1;
}

/** Probe one connection cheaply; resolves to the URI if the server answers. */
async function probe(uri: string, token: string): Promise<string> {
  const http = new ServiceHttp(uri, token, "X-Plex-Token");
  await http.get<PlexIdentity>("/identity", { timeoutMs: 5000, headers: await plexHeaders() });
  return uri;
}

/**
 * The servers this account can see, the user's own first (plex.tv also lists
 * servers shared with them). No probing here: listing is one fast call, and the
 * user picks which server to connect to.
 */
export async function listServers(accountToken: string): Promise<PlexResource[]> {
  const http = new ServiceHttp(PLEX_TV, accountToken, "X-Plex-Token");
  const resources = await http.get<PlexResource[]>("/resources", {
    params: { includeHttps: 1, includeRelay: 1 },
    headers: await plexHeaders(),
  });
  return resources
    .filter((r) => r.provides?.split(",").includes("server"))
    .sort((a, b) => Number(b.owned === true) - Number(a.owned === true));
}

/**
 * Settle on an address of one server that answers from wherever the phone is.
 *
 * Every probe starts at once, then tiers are accepted in order of preference:
 * the first LAN address to answer wins outright, else the first public one,
 * else a relay. Waiting for every probe instead (as before) cost ~29 s at home:
 * a server advertises a dozen Docker addresses that only fail on timeout.
 */
export async function connectServer(r: PlexResource, accountToken: string): Promise<PlexServer> {
  const token = r.accessToken ?? accountToken;
  const probes = (r.connections ?? []).map((c) => {
    const p = probe(c.uri, token);
    p.catch(() => {}); // a tier never awaited must not surface as unhandled
    return { tier: rank(c), p };
  });

  for (const tier of [0, 1, 3]) {
    const inTier = probes.filter((x) => x.tier === tier);
    if (!inTier.length) continue;
    try {
      const uri = await Promise.any(inTier.map((x) => x.p));
      return { name: r.name, clientIdentifier: r.clientIdentifier, uri, accessToken: token };
    } catch {
      // Nothing in this tier answered: try the next one.
    }
  }
  throw new HttpError("Serveur Plex injoignable depuis ce réseau", 0, "network");
}

/* ---------- server ---------- */

export function createPlexClient(baseUrl: string, token: string) {
  const http = new ServiceHttp(baseUrl, token, "X-Plex-Token");

  return {
    base: baseUrl,

    async getIdentity(): Promise<PlexIdentity> {
      return http.get<PlexIdentity>("/", { headers: await plexHeaders() });
    },

    async getSessions(): Promise<PlexSessionsResponse> {
      return http.get<PlexSessionsResponse>("/status/sessions", { headers: await plexHeaders() });
    },

    /**
     * Poster for a session's item, resized by the server to keep it small.
     * Sized for the card at 3x pixel density — asking for the CSS size alone
     * makes it soft on a phone screen.
     */
    imageUrl(thumb: string): string {
      const params = new URLSearchParams({
        width: "210",
        height: "315",
        minSize: "1",
        upscale: "1",
        url: thumb,
        "X-Plex-Token": token,
      });
      return `${baseUrl}/photo/:/transcode?${params.toString()}`;
    },
  };
}

export type PlexClient = ReturnType<typeof createPlexClient>;
