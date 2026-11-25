import { registerPlugin } from "@capacitor/core";

/** Error codes the native side rejects `request` with. */
export type PinnedHttpErrorCode = "not_private" | "cert_mismatch" | "network";

export interface PinnedHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Raw request body. */
  data?: string;
  timeoutMs: number;
  /** Expected leaf-certificate SHA-256 ("AB:CD:…"); none on first contact. */
  pin?: string;
}

export interface PinnedHttpResponse {
  status: number;
  headers: Record<string, string>;
  /** Raw response body. */
  data: string;
  /** Fingerprint of the certificate the server presented. */
  fingerprint: string;
}

/**
 * HTTPS to a self-signed service on a private IPv4 (Proxmox), with the
 * certificate pinned instead of verified (android/…/PinnedHttpPlugin.java).
 * A `cert_mismatch` rejection carries `data.fingerprint`, the one received.
 * Android only.
 */
export interface PinnedHttpPluginInterface {
  request(opts: PinnedHttpRequest): Promise<PinnedHttpResponse>;
}

export const PinnedHttp = registerPlugin<PinnedHttpPluginInterface>("PinnedHttp");
