export const SERVICE_URL_ERROR =
  "Adresse invalide — ex. https://radarr.domaine.com ou http://192.168.1.10:7878";

/**
 * Canonical form of a service address typed by the user.
 *
 * - "" for blank input (not configured yet, not an error);
 * - null when the address is unusable;
 * - otherwise `protocol://host[:port][/path]`, without trailing slash.
 *
 * No scheme means https. Only http and https are accepted: http is how a
 * service is reached on the LAN / over the VPN, bypassing the reverse proxy.
 */
export function normalizeServiceUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return "";
  if (/\s/.test(input)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}
