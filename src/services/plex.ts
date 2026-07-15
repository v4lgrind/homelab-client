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
 * Step 1 — ask plex.tv for a PIN. The user approves it by signing in at the
 * returned URL; step 2 polls until that happens.
 */
export async function createPin(): Promise<{ pin: PlexPin; authUrl: string }> {
  const http = new ServiceHttp(PLEX_TV, "", "X-Plex-Token");
  const headers = await plexHeaders();
  const pin = await http.request<PlexPin>("/pins", {
    method: "POST",
    params: { strong: true },
    headers,
  });

  const params = new URLSearchParams({
    clientID: headers["X-Plex-Client-Identifier"],
    code: pin.code,
    "context[device][product]": CLIENT_INFO.name,
  });
  return { pin, authUrl: `https://app.plex.tv/auth#?${params.toString()}` };
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
 * Find the user's servers via plex.tv and settle on an address that actually
 * answers from wherever the phone currently is (LAN, WAN or relay). Probing
 * beats guessing: the right answer changes with the network.
 */
export async function discoverServers(accountToken: string): Promise<PlexServer[]> {
  const http = new ServiceHttp(PLEX_TV, accountToken, "X-Plex-Token");
  const resources = await http.get<PlexResource[]>("/resources", {
    params: { includeHttps: 1, includeRelay: 1 },
    headers: await plexHeaders(),
  });

  const servers = resources.filter((r) => r.provides?.split(",").includes("server"));
  const out: PlexServer[] = [];

  for (const r of servers) {
    const token = r.accessToken ?? accountToken;
    const candidates = [...(r.connections ?? [])].sort((a, b) => rank(a) - rank(b));
    if (!candidates.length) continue;

    // Probe in parallel — a dead LAN address costs a full timeout when tried in
    // sequence — then keep the best-ranked one that answered.
    const results = await Promise.all(
      candidates.map((c) =>
        probe(c.uri, token).then(
          () => c,
          () => undefined,
        ),
      ),
    );
    const reachable = results.find((c) => c !== undefined);
    if (reachable) {
      out.push({
        name: r.name,
        clientIdentifier: r.clientIdentifier,
        uri: reachable.uri,
        accessToken: token,
      });
    }
  }

  if (!out.length) {
    throw new HttpError("Aucun serveur Plex joignable depuis ce réseau", 0, "network");
  }
  return out;
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

    /** Poster for a session's item, resized by the server to keep it small. */
    imageUrl(thumb: string): string {
      const params = new URLSearchParams({
        width: "180",
        height: "270",
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
