import type { NewNotification, NotificationLevel } from "./types.js";

const LEVELS: NotificationLevel[] = ["info", "success", "warning", "error"];

function asLevel(v: unknown): NotificationLevel {
  const s = String(v ?? "").toLowerCase();
  if ((LEVELS as string[]).includes(s)) return s as NotificationLevel;
  // Common aliases sources use.
  if (s === "ok" || s === "up" || s === "resolved") return "success";
  if (s === "warn") return "warning";
  if (s === "down" || s === "fail" || s === "failed" || s === "critical") return "error";
  return "info";
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/**
 * Turn an incoming webhook into a storable notification.
 *
 * Phase A handles the generic shape — a JSON body carrying some of
 * title/message/level, with the source labelled via the query string or body.
 * Vendor-specific parsers (Radarr/Sonarr/Uptime Kuma) come in Phase D; anything
 * unrecognised still lands as a readable generic entry rather than being lost.
 */
export function normalize(
  body: Record<string, unknown>,
  query: Record<string, unknown>,
): NewNotification {
  const source = str(query.source) ?? str(body.source) ?? "generic";
  const type = str(query.type) ?? str(body.type) ?? null;
  const level = asLevel(query.level ?? body.level ?? body.severity ?? body.status);

  const title =
    str(body.title) ?? str(body.subject) ?? str(body.event) ?? str(body.message) ?? "Notification";
  // If message was already used as the title, do not repeat it in the body.
  const bodyText =
    str(body.body) ??
    str(body.description) ??
    (str(body.message) !== title ? str(body.message) : undefined) ??
    null;

  return { source, type, level, title, body: bodyText, ts: Date.now() };
}
