import { ServiceHttp, serviceBaseUrl } from "@/services/http";
import type { ArrSystemStatus, ServiceId } from "@/types/service";
import type { ArrImage, Movie, Series } from "@/types/arr";

/**
 * Client for the *arr v3 API. Radarr (movies) and Sonarr (series) share the
 * same base shape; a single client type exposes both endpoint families and the
 * caller uses the ones relevant to the service.
 */
export function createArrClient(
  id: ServiceId,
  subdomain: string,
  rootDomain: string,
  apiKey: string,
) {
  const base = serviceBaseUrl(id, subdomain, rootDomain);
  const http = new ServiceHttp(base, apiKey);

  /** Poster URL — prefer the public CDN (no auth), fall back to the local
   *  /api/mediacover path (bypassed by Authelia, authenticated via api key). */
  function posterUrl(images: ArrImage[] | undefined, mediaId: number): string | undefined {
    const poster = images?.find((i) => i.coverType === "poster");
    if (poster?.remoteUrl) return poster.remoteUrl;
    return `${base}/api/v3/mediacover/${mediaId}/poster.jpg?apikey=${encodeURIComponent(apiKey)}`;
  }

  return {
    http,
    base,
    getSystemStatus: () => http.get<ArrSystemStatus>("/api/v3/system/status"),
    getMovies: () => http.get<Movie[]>("/api/v3/movie"),
    getSeries: () => http.get<Series[]>("/api/v3/series"),
    posterUrl,
  };
}

export type ArrClient = ReturnType<typeof createArrClient>;
