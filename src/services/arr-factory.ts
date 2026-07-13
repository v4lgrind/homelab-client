import { createArrClient, type ArrClient } from "@/services/arr";
import { useConnectionStore } from "@/store/connection-store";
import type { MediaKind } from "@/types/arr";

/** Build an *arr client for the service backing a given media kind, using the
 *  current connection config. Kept out of the stores to avoid duplication. */
export function arrClientFor(kind: MediaKind): ArrClient {
  const svc = kind === "movie" ? "radarr" : "sonarr";
  const c = useConnectionStore();
  return createArrClient(svc, c.services[svc].subdomain, c.rootDomain, c.apiKeys[svc] ?? "");
}
