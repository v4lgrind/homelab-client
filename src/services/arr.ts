import { ServiceHttp, serviceBaseUrl } from "@/services/http";
import type { ArrSystemStatus, ServiceId } from "@/types/service";

/**
 * Client for the *arr v3 API (Radarr / Sonarr share the same shape). Phase 1
 * only needs the connection test; Phase 2 extends this with library, queue,
 * calendar, etc.
 */
export function createArrClient(id: ServiceId, subdomain: string, rootDomain: string, apiKey: string) {
  const http = new ServiceHttp(serviceBaseUrl(id, subdomain, rootDomain), apiKey);

  return {
    http,
    getSystemStatus() {
      return http.get<ArrSystemStatus>("/api/v3/system/status");
    },
  };
}

export type ArrClient = ReturnType<typeof createArrClient>;
