import type { NewNotification, NotificationLevel } from "./types.js";

const LEVELS: NotificationLevel[] = ["info", "success", "warning", "error"];

function asLevel(v: unknown): NotificationLevel {
  const s = String(v ?? "").toLowerCase();
  if ((LEVELS as string[]).includes(s)) return s as NotificationLevel;
  if (s === "ok" || s === "up" || s === "resolved" || s === "success") return "success";
  if (s === "warn" || s === "warning") return "warning";
  if (s === "down" || s === "fail" || s === "failed" || s === "critical" || s === "error") {
    return "error";
  }
  return "info";
}

type Body = Record<string, unknown>;

function str(v: unknown): string | undefined {
  if (v == null || typeof v === "object") return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

/** First non-empty string among the given top-level fields. */
function firstStr(body: Body, fields: string[]): string | undefined {
  for (const f of fields) {
    const s = str(body[f]);
    if (s) return s;
  }
  return undefined;
}

/** Read a nested value, e.g. get(body, "movie", "title"). */
function get(body: Body, ...path: string[]): unknown {
  let cur: unknown = body;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Body)[key];
  }
  return cur;
}

/**
 * These are common field-name conventions, not per-app rules: any webhook that
 * uses them benefits, and nothing has to be registered for a new source to work.
 */
const TITLE_FIELDS = ["title", "subject", "summary", "alertname", "name"];
const MESSAGE_FIELDS = ["message", "body", "description", "text", "content", "msg", "details", "reason", "alert"];
/** Nested objects whose title/name is the real subject of the notification. */
const SUBJECT_PATHS: [string, string][] = [
  ["movie", "title"],
  ["series", "title"],
  ["monitor", "name"],
  ["book", "title"],
  ["album", "title"],
  ["artist", "artistName"],
  ["container", "name"],
  ["service", "name"],
];
const QUALITY_PATHS: [string, string][] = [
  ["movieFile", "quality"],
  ["episodeFile", "quality"],
  ["release", "quality"],
];
const SOURCE_FIELDS = ["instanceName", "appName", "application", "app", "service", "source"];
/** Noise not worth showing in the summary fallback. */
const SUMMARY_SKIP = new Set([
  ...TITLE_FIELDS,
  ...MESSAGE_FIELDS,
  ...SOURCE_FIELDS,
  "level",
  "severity",
  "priority",
  "status",
  "applicationUrl",
  "downloadId",
  "wikiUrl",
]);

function pad(n: unknown): string {
  return String(n ?? 0).padStart(2, "0");
}

/** Light humanising of common event verbs; unknown ones pass through as-is. */
const EVENT_LABELS: Record<string, string> = {
  grab: "Récupéré",
  download: "Importé",
  rename: "Renommé",
  test: "Test",
  health: "Alerte santé",
  healthissue: "Alerte santé",
  healthrestored: "Rétabli",
  applicationupdate: "Mise à jour",
  manualinteractionrequired: "Intervention requise",
  movieadded: "Ajouté",
  seriesadd: "Ajouté",
  moviedelete: "Supprimé",
  seriesdelete: "Supprimé",
};

/** The thing the notification is about. */
function extractTitle(body: Body): string | undefined {
  const flat = firstStr(body, TITLE_FIELDS);
  if (flat) return flat;

  for (const [obj, key] of SUBJECT_PATHS) {
    const t = str(get(body, obj, key));
    if (t) {
      // Series episodes read better as "Show — S02E05".
      const eps = get(body, "episodes");
      const ep = Array.isArray(eps) ? (eps[0] as Body | undefined) : undefined;
      if (ep && ep.episodeNumber != null) return `${t} — S${pad(ep.seasonNumber)}E${pad(ep.episodeNumber)}`;
      const year = str(get(body, obj, "year"));
      return year ? `${t} (${year})` : t;
    }
  }
  return undefined;
}

/** Summarise leftover scalar fields, so an unknown payload is never blank. */
function summarize(body: Body): string | undefined {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (SUMMARY_SKIP.has(k)) continue;
    const s = str(v);
    if (s) parts.push(`${k}: ${s}`);
    if (parts.length >= 4) break;
  }
  return parts.length ? parts.join(" · ") : undefined;
}

/** What happened. */
function extractBody(body: Body): string | null {
  const msg = firstStr(body, MESSAGE_FIELDS) ?? str(get(body, "heartbeat", "msg"));

  const event = firstStr(body, ["eventType", "event"]);
  const quality = QUALITY_PATHS.map(([o, k]) => str(get(body, o, k))).find(Boolean);
  const structuredParts: string[] = [];
  if (event) structuredParts.push(EVENT_LABELS[event.toLowerCase()] ?? event);
  if (quality) structuredParts.push(quality);
  const prev = str(body.previousVersion);
  const next = str(body.newVersion);
  if (prev && next) structuredParts.push(`${prev} → ${next}`);
  const structured = structuredParts.join(" · ") || undefined;

  // A plain message wins; else the structured summary; else a payload digest.
  return msg ?? structured ?? summarize(body) ?? null;
}

/** info / success / warning / error, from explicit fields, status, then event. */
function detectLevel(body: Body, query: Body): NotificationLevel {
  const explicit = query.level ?? body.level ?? body.severity ?? body.priority;
  if (explicit != null) return asLevel(explicit);

  const status = body.status ?? get(body, "heartbeat", "status");
  if (typeof status === "number") return status ? "success" : "error"; // 1 up / 0 down
  if (str(status)) return asLevel(status);

  const event = firstStr(body, ["eventType", "event"])?.toLowerCase();
  if (event) {
    if (["grab", "download", "movieadded", "seriesadd", "healthrestored", "rename"].includes(event)) {
      return "success";
    }
    if (["health", "healthissue", "moviedelete", "seriesdelete", "manualinteractionrequired"].includes(event)) {
      return "warning";
    }
  }
  return "info";
}

/**
 * Turn any incoming webhook into a readable notification from field-name
 * heuristics alone — no per-source parser, so a new app works the moment it
 * points a webhook here. `source`/`type`/`level` may be set via the query
 * string, but none of it is required: they are sniffed from the body otherwise,
 * and the summary fallback guarantees a non-empty body even for an unknown shape.
 */
export function normalize(body: Body, query: Body): NewNotification {
  const source = str(query.source) ?? firstStr(body, SOURCE_FIELDS) ?? "generic";
  const type = str(query.type) ?? null;
  const level = detectLevel(body, query);
  const title = extractTitle(body) ?? source;
  return { source, type, level, title, body: extractBody(body), ts: Date.now() };
}
